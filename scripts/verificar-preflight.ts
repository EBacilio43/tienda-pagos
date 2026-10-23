/**
 * Precondiciones de datos de las migraciones PENDIENTES, contra la base a
 * la que se va a desplegar. Solo lectura.
 *
 * Por qué existe, si el CI ya corre `migrate deploy`: el CI lo hace contra
 * una base VACÍA. Ahí un `UPDATE` de normalización toca 0 filas y un
 * `CHECK` se agrega a una tabla sin datos, así que el modo de fallo que
 * importa es imposible de reproducir. La luz verde del CI es honesta sobre
 * la sintaxis y muda sobre los datos. Esto cubre lo otro.
 *
 * Importa porque `docker/entrypoint.sh` corre `migrate deploy` en cada
 * arranque: una migración que falla contra los datos reales no es un error
 * que se lea con calma, es un contenedor que muere y un despliegue caído.
 *
 * Se descubrió su necesidad en Fase 8 (2026-08-13), haciéndolo a mano.
 *
 * Uso: npm run verificar-preflight
 *      Usa DIRECT_DATABASE_URL (la misma que usa `migrate deploy`), no el
 *      pooler — si apuntara distinto, verificaría otra base que la que se
 *      va a migrar.
 */
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DIRECT_DATABASE_URL (o DATABASE_URL) en el entorno.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasourceUrl: url });

type Resultado = { ok: boolean; detalle: string };
type Precondicion = { descripcion: string; probar: () => Promise<Resultado> };

/**
 * Se registran POR MIGRACIÓN, no como una lista suelta, para que se salten
 * solas en cuanto esa migración ya está aplicada. Contra producción hoy, lo
 * único que corre es lo de la última.
 *
 * **Toda** migración lleva entrada aquí, incluidas las que no necesitan
 * ninguna comprobación: en esas la lista va vacía y el comentario dice por
 * qué. No es burocracia — una migración pendiente que no aparezca en este
 * mapa hace fallar el script (ver `main`). Antes el hueco se reportaba por
 * texto y se salía con código 0, y desde que `docker/entrypoint.sh` depende
 * de esto para arrancar, eso era aprobar en verde justamente la migración
 * que nadie revisó.
 */
const PRECONDICIONES: Record<string, Precondicion[]> = {
  // Crea el esquema desde cero; en producción se marcó como ya aplicada con
  // `migrate resolve --applied` (Fase 8). No hay dato previo que la rompa.
  "00000000000000_baseline": [],

  "00000000000001_sesiones": [
    {
      descripcion: "alembic_version existe (la migración hace DROP TABLE sin IF EXISTS)",
      probar: async () => {
        const filas = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'alembic_version'`;
        const existe = Number(filas[0].n) > 0;
        return { ok: existe, detalle: existe ? "presente" : "AUSENTE, el DROP va a fallar" };
      },
    },
  ],

  // Solo crea la vista v_saldos_cliente. No lee ni reescribe filas.
  "00000000000002_v_saldos_cliente": [],

  // Solo crea la tabla movimientos_stock y su índice.
  "00000000000003_movimientos_stock": [],

  "00000000000004_integridad_dominio": [
    {
      descripcion: "0 nombres de cliente duplicados (crea un UNIQUE INDEX)",
      probar: async () => {
        const filas = await prisma.$queryRaw<{ nombre: string; n: bigint }[]>`
          SELECT nombre, count(*) AS n FROM clientes GROUP BY nombre HAVING count(*) > 1`;
        return {
          ok: filas.length === 0,
          detalle:
            filas.length === 0
              ? "sin duplicados"
              : filas.map((f) => `"${f.nombre}" x${Number(f.n)}`).join(", "),
        };
      },
    },
  ],

  // Un CREATE INDEX sobre auditoria.fecha_registro: no puede fallar por los
  // datos, solo tardar.
  "20260810142623_agregar_indice_fecha_registro": [],

  "20260811020000_indices_fk_y_check_constraints": [
    {
      descripcion: "0 violaciones de los cinco CHECK de no-negativos",
      probar: async () => {
        const filas = await prisma.$queryRaw<{ etiqueta: string; n: bigint }[]>`
          SELECT 'catalogo.stock' AS etiqueta, count(*) AS n FROM catalogo WHERE stock < 0
          UNION ALL SELECT 'pagos.monto', count(*) FROM pagos WHERE monto <= 0
          UNION ALL SELECT 'ventas.monto_total', count(*) FROM ventas WHERE monto_total < 0
          UNION ALL SELECT 'ventas.enganche', count(*) FROM ventas WHERE enganche < 0
          UNION ALL SELECT 'devoluciones.monto_credito', count(*) FROM devoluciones WHERE monto_credito < 0`;
        const malas = filas.filter((f) => Number(f.n) > 0);
        return {
          ok: malas.length === 0,
          detalle:
            malas.length === 0
              ? "sin violaciones"
              : malas.map((f) => `${f.etiqueta}: ${Number(f.n)} fila(s)`).join(", "),
        };
      },
    },
  ],

  "20260817120000_metodo_pago_cerrado": [
    {
      // La migración normaliza mayúsculas antes del CHECK, así que
      // 'EFECTIVO' sobreviviría. Lo que no sobrevive es un valor que no
      // esté en el conjunto ni siquiera en minúsculas: un 'cheque' haría
      // fallar el ALTER TABLE y con él el arranque del contenedor.
      descripcion: "todo metodo_pago cae en el conjunto tras normalizar mayúsculas",
      probar: async () => {
        const filas = await prisma.$queryRaw<{ metodo_pago: string; n: bigint }[]>`
          SELECT metodo_pago, count(*) AS n FROM pagos
          WHERE metodo_pago IS NOT NULL
            AND lower(metodo_pago) NOT IN
                ('efectivo', 'transferencia', 'tarjeta', 'depósito', 'deposito', 'otro')
          GROUP BY metodo_pago`;
        return {
          ok: filas.length === 0,
          detalle:
            filas.length === 0
              ? "todos dentro del conjunto"
              : filas.map((f) => `"${f.metodo_pago}" x${Number(f.n)}`).join(", "),
        };
      },
    },
  ],

  // Agrega `devolucion_articulos.precio_credito` (nueva, toda NULL) y un
  // CHECK que solo puede mirar esa columna: `precio_credito IS NULL` es
  // verdad en las 5 filas existentes, así que la restricción se valida
  // trivialmente y no hay dato previo capaz de romperla. La columna es
  // nullable, de modo que el ALTER TABLE tampoco reescribe la tabla.
  "20260905180000_precio_credito_devolucion": [],

  // Agrega el CHECK clientes_no_auto_absorcion. Verifica que no
  // existan clientes con absorbido_por apuntándose a sí mismos.
  "20261015000000_check_absorbido_por_no_ciclo": [
    {
      descripcion: "0 clientes con auto-absorción (absorbido_por = id)",
      probar: async () => {
        const filas = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM clientes WHERE absorbido_por IS NOT DISTINCT FROM id`;
        const n = Number(filas[0].n);
        return {
          ok: n === 0,
          detalle: n === 0 ? "sin auto-absorciones" : `${n} cliente(s) con absorbido_por = id`,
        };
      },
    },
  ],

  // P11: Crea la tabla idempotencia_tokens y su índice. No depende de datos previos.
  "20261015000000_idempotencia_tokens": [],
};

async function migracionesPendientes(): Promise<string[]> {
  const enDisco = readdirSync(join(process.cwd(), "prisma", "migrations"), {
    withFileTypes: true,
  })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  // Una base sin _prisma_migrations nunca se migró: todo está pendiente.
  const tabla = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'`;
  if (Number(tabla[0].n) === 0) return enDisco;

  const aplicadas = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  const yaEstan = new Set(aplicadas.map((a) => a.migration_name));
  return enDisco.filter((m) => !yaEstan.has(m));
}

/**
 * Una precondición que lanza cuenta como NO cumplida, no como caída del
 * script. Pasa de verdad: contra una base vacía, la precondición de
 * `00000000000004` consulta `clientes`, que la crea el baseline —también
 * pendiente— así que Prisma tira `relation does not exist` y abortaba el
 * recorrido en la primera excepción. Quien lee esto en los logs de un
 * arranque necesita el informe completo y una frase, no un stack trace del
 * que no puede distinguir "tus datos están mal" de "el script se rompió".
 */
async function probarSinLanzar(check: Precondicion): Promise<Resultado> {
  try {
    return await check.probar();
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    const unaLinea = mensaje.replace(/\s+/g, " ").trim().slice(0, 180);
    return { ok: false, detalle: `no se pudo comprobar — ${unaLinea}` };
  }
}

async function main() {
  console.log(`Base: ${new URL(url as string).hostname}\n`);

  const pendientes = await migracionesPendientes();
  if (pendientes.length === 0) {
    console.log("No hay migraciones pendientes. Nada que verificar.");
    return;
  }

  console.log(`${pendientes.length} migracion(es) pendiente(s):`);
  pendientes.forEach((m) => console.log(`  - ${m}`));
  console.log("");

  // Un hueco en el mapa NO es un aprobado. Este script decide si el
  // contenedor arranca (docker/entrypoint.sh), asi que "nadie declaro nada"
  // tiene que doler ahora, y no cuando `migrate deploy` reviente contra los
  // datos reales y deje la migracion marcada como errored.
  const sinDeclarar = pendientes.filter((m) => !(m in PRECONDICIONES));
  if (sinDeclarar.length > 0) {
    console.log("Migracion(es) pendientes que no declaran precondiciones:");
    sinDeclarar.forEach((m) => console.log(`  - ${m}`));
    console.log("");
    console.log("Toda migracion lleva su entrada en PRECONDICIONES, aunque sea una");
    console.log("lista vacia con el motivo escrito al lado. Un hueco aqui no dice");
    console.log("que la migracion sea segura: dice que nadie lo penso.");
    process.exitCode = 1;
    return;
  }

  let fallas = 0;
  let corridas = 0;

  for (const migracion of pendientes) {
    const checks = PRECONDICIONES[migracion];
    if (checks.length === 0) continue;

    console.log(migracion);
    for (const check of checks) {
      corridas++;
      const r = await probarSinLanzar(check);
      if (!r.ok) fallas++;
      console.log(`  ${r.ok ? "OK " : "MAL"} ${check.descripcion}: ${r.detalle}`);
    }
    console.log("");
  }

  if (corridas === 0) {
    console.log("Las pendientes declaran explicitamente que no dependen de los");
    console.log("datos existentes. Nada que verificar.");
    return;
  }

  if (fallas > 0) {
    console.log(`${fallas} precondicion(es) sin cumplir. NO despliegues todavia:`);
    console.log("  entrypoint.sh corre migrate deploy al arrancar, y si falla");
    console.log("  el contenedor muere antes de servir.");
    process.exitCode = 1;
  } else {
    console.log(`${corridas} precondicion(es) cumplidas. Las migraciones deberian aplicar.`);
  }
}

main()
  .catch((err) => {
    console.error("Error corriendo verificar-preflight:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
