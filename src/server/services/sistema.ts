import { readFile } from "node:fs/promises";
import os from "node:os";
import { prisma } from "@/server/db/prisma";
import { fechaHoraSegundosAString, tiempoRelativo } from "@/lib/fecha";
import { mediana } from "@/lib/sistema";
import type { SnapshotSistema, TablaSistemaDTO } from "@/types/dominio";

/**
 * Instrumentación de la propia instancia, para /admin/sistema. Todo lo de
 * aquí es de SOLO LECTURA y se calcula en el momento de pedirlo: no hay
 * histórico, no hay serie temporal, no hay proceso en segundo plano
 * muestreando. Guardar una serie es un problema distinto (retención,
 * agregación, un almacén) y no es lo que se pidió (regla 9).
 *
 * Dos horizontes distintos conviven aquí y conviene no confundirlos:
 *
 * - El PROCESO de Node — `process.memoryUsage()`, `process.cpuUsage()`,
 *   `process.uptime()`. Es lo que gasta la app.
 * - El CONTENEDOR — los archivos de cgroup v2 montados en /sys/fs/cgroup.
 *   Es lo que gasta todo lo que corre dentro, la app incluida, y es contra
 *   lo que se aplica el límite que mata el contenedor (OOM kill).
 *
 * `os.totalmem()` / `os.freemem()` NO son ninguno de los dos dentro de un
 * contenedor: leen /proc/meminfo, que no está namespaced, así que reportan
 * la máquina (en Docker Desktop, la VM de WSL2) y no el contenedor. Se usan
 * solo como respaldo cuando cgroup no está disponible, y la UI dice cuál de
 * las dos fuentes acabó usando.
 */

const MUESTRAS_LATENCIA = 5;
const VENTANA_CPU_MS = 250;

// ---------------------------------------------------------------- cgroup

async function leerCgroup(archivo: string): Promise<string | null> {
  try {
    return (await readFile(`/sys/fs/cgroup/${archivo}`, "utf8")).trim();
  } catch {
    // No es un error: fuera de Linux con cgroup v2 (o con cgroup v1) estos
    // archivos simplemente no existen, y el llamador ya tiene un respaldo.
    return null;
  }
}

async function leerCgroupNumero(archivo: string): Promise<number | null> {
  const crudo = await leerCgroup(archivo);
  // "max" es cgroup v2 diciendo "sin límite" — no es un número, y
  // convertirlo daría NaN o, peor, Infinity disfrazado de dato.
  if (crudo === null || crudo === "max") return null;
  const valor = Number(crudo);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Lo mismo que reporta `docker stats`: `memory.current` menos la caché de
 * archivos inactiva. Esa caché cuenta dentro del cgroup pero el kernel la
 * suelta bajo presión, así que incluirla hace ver al contenedor mucho más
 * lleno de lo que está — y es la diferencia entre "hay que subir el plan" y
 * "no pasa nada".
 */
async function memoriaCgroup(): Promise<{ usado: number; limite: number | null } | null> {
  const actual = await leerCgroupNumero("memory.current");
  if (actual === null) return null;

  const stat = await leerCgroup("memory.stat");
  const inactiveFile = stat?.match(/^inactive_file (\d+)$/m)?.[1];
  const usado = inactiveFile ? Math.max(0, actual - Number(inactiveFile)) : actual;

  return { usado, limite: await leerCgroupNumero("memory.max") };
}

/** El tiempo de CPU consumido por TODO el contenedor, en microsegundos. */
async function cpuUsadaCgroupUsec(): Promise<number | null> {
  const stat = await leerCgroup("cpu.stat");
  const usec = stat?.match(/^usage_usec (\d+)$/m)?.[1];
  return usec ? Number(usec) : null;
}

/**
 * Cuántos núcleos puede usar de verdad el contenedor. `cpu.max` viene como
 * "<cuota> <periodo>" ("50000 100000" = medio núcleo) o "max <periodo>"
 * cuando no hay cuota — en ese caso mandan los núcleos visibles.
 */
async function nucleosDisponibles(): Promise<{ nucleos: number; conCuota: boolean }> {
  const crudo = await leerCgroup("cpu.max");
  const [cuota, periodo] = crudo?.split(/\s+/) ?? [];
  if (cuota && cuota !== "max" && periodo) {
    const nucleos = Number(cuota) / Number(periodo);
    if (Number.isFinite(nucleos) && nucleos > 0) return { nucleos, conCuota: true };
  }
  return { nucleos: os.cpus().length, conCuota: false };
}

// ------------------------------------------------------------------- CPU

/**
 * Uso de CPU en una ventana corta, del proceso y del contenedor a la vez.
 * Se miden juntos y sobre el MISMO intervalo a propósito: dos ventanas
 * distintas darían dos porcentajes que no se pueden comparar entre sí.
 *
 * El `await` de la espera no bloquea el bucle de eventos, así que durante
 * la ventana el servidor sigue atendiendo — lo que se mide es la carga
 * ambiente, que es justo lo que se quiere saber. Una instancia ociosa
 * marcará ~0%, y eso es el dato correcto, no una medición fallida.
 */
async function muestrearCpu(nucleos: number): Promise<{
  procesoPct: number;
  contenedorPct: number | null;
}> {
  const cpuProcesoAntes = process.cpuUsage();
  const cgroupAntes = await cpuUsadaCgroupUsec();
  const inicio = process.hrtime.bigint();

  await new Promise((resolver) => setTimeout(resolver, VENTANA_CPU_MS));

  const cpuProcesoDespues = process.cpuUsage(cpuProcesoAntes);
  const cgroupDespues = await cpuUsadaCgroupUsec();
  const transcurridoUsec = Number(process.hrtime.bigint() - inicio) / 1000;

  // Dividir entre los núcleos: 100% significa "toda la CPU que tiene", no
  // "un núcleo saturado" — sin eso, en 4 núcleos el techo sería 400% y el
  // número no se podría comparar contra un umbral.
  const porNucleo = transcurridoUsec * nucleos;

  return {
    procesoPct: ((cpuProcesoDespues.user + cpuProcesoDespues.system) / porNucleo) * 100,
    contenedorPct:
      cgroupAntes !== null && cgroupDespues !== null
        ? ((cgroupDespues - cgroupAntes) / porNucleo) * 100
        : null,
  };
}

// ------------------------------------------------------------ base de datos

type EstadisticasBD = {
  version: string;
  tamanoBytes: number;
  conexionesActivas: number;
  conexionesTotales: number;
  maxConexiones: number | null;
  arrancadaEn: Date | null;
};

async function estadisticasBaseDatos(): Promise<EstadisticasBD> {
  // Una sola ida y vuelta: contra una base remota cada consulta suelta agrega
  // latencia de red, y esta pantalla es justamente la que
  // no debería falsear su propia medición de latencia con su propio ruido.
  const [fila] = await prisma.$queryRaw<
    {
      version: string;
      tamano: bigint;
      activas: bigint;
      totales: bigint;
      max_conexiones: string | null;
      arrancada_en: Date | null;
    }[]
  >`
    SELECT
      version() AS version,
      pg_database_size(current_database()) AS tamano,
      (SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'active') AS activas,
      (SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database()) AS totales,
      current_setting('max_connections', true) AS max_conexiones,
      pg_postmaster_start_time() AS arrancada_en
  `;

  const max = fila.max_conexiones ? Number(fila.max_conexiones) : null;

  return {
    // "PostgreSQL 17.10 (Debian …) on x86_64 …" — la línea entera no cabe
    // ni aporta; lo que se quiere saber es la versión.
    version: fila.version.split(" on ")[0],
    tamanoBytes: Number(fila.tamano),
    conexionesActivas: Number(fila.activas),
    conexionesTotales: Number(fila.totales),
    maxConexiones: max !== null && Number.isFinite(max) ? max : null,
    arrancadaEn: fila.arrancada_en,
  };
}

/**
 * Latencia real de ida y vuelta a la base. `SELECT 1` no hace trabajo, así
 * que lo que queda medido es la red más el pool — que es lo que de verdad
 * duele contra un pooler remoto.
 *
 * Secuencial y no en paralelo a propósito: cinco consultas simultáneas
 * miden cuánto tarda el pool en dar cinco conexiones, no cuánto tarda un
 * viaje. La primera muestra suele ser la más lenta (conexión fría), y por
 * eso se reporta la mediana además del máximo.
 */
async function medirLatencia(): Promise<number[]> {
  const muestras: number[] = [];
  for (let i = 0; i < MUESTRAS_LATENCIA; i += 1) {
    const inicio = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    muestras.push(performance.now() - inicio);
  }
  return muestras;
}

/**
 * Filas reales por tabla, con `count(*)` y no con `n_live_tup` de
 * `pg_stat_user_tables`. Esa columna es una estimación que solo se actualiza
 * con ANALYZE: en esta misma base, después de restaurar producción con
 * COPY, decía 0 clientes cuando había 11 (medido el 2026-09-05). Un panel
 * de sistema que miente sobre cuántos datos hay no sirve para nada, y son
 * siete conteos sobre tablas de miles de filas, no de millones.
 */
async function conteoDeTablas(): Promise<TablaSistemaDTO[]> {
  const [clientes, ventas, pagos, devoluciones, catalogo, auditoria, sesiones] = await Promise.all([
    prisma.cliente.count(),
    prisma.venta.count(),
    prisma.pago.count(),
    prisma.devolucion.count(),
    prisma.catalogo.count(),
    prisma.auditoria.count(),
    prisma.sesion.count(),
  ]);

  return [
    { nombre: "Clientes", filas: clientes },
    { nombre: "Ventas", filas: ventas },
    { nombre: "Abonos", filas: pagos },
    { nombre: "Devoluciones", filas: devoluciones },
    { nombre: "Catálogo", filas: catalogo },
    { nombre: "Auditoría", filas: auditoria },
    { nombre: "Sesiones", filas: sesiones },
  ];
}

// ------------------------------------------------------------- el snapshot

export async function obtenerSnapshotSistema(): Promise<SnapshotSistema> {
  const inicio = performance.now();
  const ahora = new Date();

  const { nucleos, conCuota } = await nucleosDisponibles();

  // La ventana de CPU (250 ms) corre EN PARALELO con las consultas: si se
  // hicieran en serie, la pantalla tardaría esos 250 ms de más en cada
  // refresco sin medir nada mejor.
  const [cpu, memoria, bd, latencias, tablas] = await Promise.all([
    muestrearCpu(nucleos),
    memoriaCgroup(),
    estadisticasBaseDatos(),
    medirLatencia(),
    conteoDeTablas(),
  ]);

  const mem = process.memoryUsage();
  const uptimeProceso = process.uptime();

  // Promedio desde el arranque: complementa la muestra instantánea. Una
  // instancia que ahora está ociosa pero lleva horas al 80% se ve igual que
  // una sana si solo se mira la ventana de 250 ms.
  const cpuAcumulada = process.cpuUsage();
  const cpuPromedioPct =
    uptimeProceso > 0
      ? ((cpuAcumulada.user + cpuAcumulada.system) / 1000 / (uptimeProceso * 1000 * nucleos)) * 100
      : 0;

  const memoriaUsada = memoria?.usado ?? os.totalmem() - os.freemem();
  const memoriaLimite = memoria?.limite ?? os.totalmem();

  return {
    generadoEn: fechaHoraSegundosAString(ahora),
    recoleccionMs: performance.now() - inicio,

    app: {
      entorno: process.env.NODE_ENV ?? "desconocido",
      versionNode: process.version,
      plataforma: `${process.platform} ${process.arch}`,
      uptimeSegundos: uptimeProceso,
      hostname: os.hostname(),
    },

    proceso: {
      rssBytes: mem.rss,
      heapUsadoBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      externoBytes: mem.external,
      cpuMuestraPct: cpu.procesoPct,
      cpuPromedioPct,
    },

    contenedor: {
      // `fuente` no es decorativo: dice si el número describe al contenedor
      // (cgroup) o a la máquina entera (os), y son cosas muy distintas.
      fuente: memoria ? "cgroup" : "os",
      memoriaUsadaBytes: memoriaUsada,
      memoriaLimiteBytes: memoriaLimite,
      memoriaPct: memoriaLimite > 0 ? (memoriaUsada / memoriaLimite) * 100 : null,
      // Sin límite de cgroup, el "límite" mostrado es la RAM de la máquina:
      // real como techo físico, pero no es una cuota que alguien haya puesto.
      memoriaConLimite: memoria?.limite != null,
      nucleos,
      nucleosConCuota: conCuota,
      cpuMuestraPct: cpu.contenedorPct,
      // loadavg es de la MÁQUINA, no del contenedor: /proc/loadavg no está
      // namespaced. Se muestra etiquetado como tal, no como carga de la app.
      cargaPromedio: os.loadavg(),
    },

    baseDatos: {
      version: bd.version,
      tamanoBytes: bd.tamanoBytes,
      conexionesActivas: bd.conexionesActivas,
      conexionesTotales: bd.conexionesTotales,
      maxConexiones: bd.maxConexiones,
      conexionesPct:
        bd.maxConexiones && bd.maxConexiones > 0
          ? (bd.conexionesTotales / bd.maxConexiones) * 100
          : null,
      arrancadaEn: bd.arrancadaEn ? fechaHoraSegundosAString(bd.arrancadaEn) : null,
      arrancadaHace: bd.arrancadaEn ? tiempoRelativo(bd.arrancadaEn, ahora) : null,
      latenciaMinMs: Math.min(...latencias),
      latenciaMedianaMs: mediana(latencias),
      latenciaMaxMs: Math.max(...latencias),
      latenciaMuestras: latencias.length,
      tablas,
    },
  };
}
