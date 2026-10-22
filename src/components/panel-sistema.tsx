"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PanelTabla } from "@/components/panel-tabla";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  formatearBytes,
  formatearDuracion,
  formatearMs,
  mediana,
  nivelPorUmbral,
  type NivelSalud,
} from "@/lib/sistema";
import { cn } from "@/lib/utils";
import { obtenerSnapshotSistemaAction } from "@/server/actions/sistema";
import type { SnapshotSistema } from "@/types/dominio";

const INTERVALO_MS = 10_000;
/** Cuántos viajes se conservan para la mini-gráfica. */
const MUESTRAS_VISIBLES = 30;

// Los tres niveles sobre tokens que ya existen. `--devolucion` como color de
// advertencia no es una licencia nueva: es el mismo que <Alert variant=
// "aviso"> ya usa desde Fase 9. Cada nivel lleva además su propia palabra,
// para que el estado no dependa solo del hue.
const NIVEL: Record<NivelSalud, { clase: string; claseFondo: string; palabra: string }> = {
  bien: { clase: "text-exito", claseFondo: "bg-exito", palabra: "normal" },
  aviso: { clase: "text-devolucion", claseFondo: "bg-devolucion", palabra: "alto" },
  critico: { clase: "text-destructive", claseFondo: "bg-destructive", palabra: "crítico" },
};

export function PanelSistema({ inicial }: { inicial: SnapshotSistema }) {
  const [snapshot, setSnapshot] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enVivo, setEnVivo] = useState(true);
  // El viaje redondo medido DESDE EL NAVEGADOR: red + cola del servidor +
  // el trabajo real. Es el tiempo de respuesta que de verdad se siente, y
  // no se puede medir desde el servidor, que solo ve su propia parte.
  const [viajes, setViajes] = useState<number[]>([]);

  // La marca de cuándo se pintó el snapshot que se está viendo. Se guarda
  // en estado y no se recalcula en el render, porque un Date.now() en el
  // cuerpo del componente da valores distintos en servidor y cliente y
  // rompe la hidratación.
  const [refrescadoEn, setRefrescadoEn] = useState<string | null>(null);

  // El intervalo lee esto en vez de `cargando`: sin la ref, el efecto
  // tendría que depender del estado y se reprogramaría el temporizador en
  // cada refresco, corriendo el reloj de 10 s cada vez.
  const cargandoRef = useRef(false);

  const refrescar = useCallback(async () => {
    if (cargandoRef.current) return;
    cargandoRef.current = true;
    setCargando(true);

    const inicio = performance.now();
    try {
      const resultado = await obtenerSnapshotSistemaAction();
      const transcurrido = performance.now() - inicio;

      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setError(null);
      setSnapshot(resultado.snapshot);
      setViajes((prev) => [...prev, transcurrido].slice(-MUESTRAS_VISIBLES));
      setRefrescadoEn(new Date().toLocaleTimeString("es-MX"));
    } catch {
      // Una Server Action que no llega (red caída, servidor reiniciándose)
      // rechaza la promesa; en un panel de diagnóstico eso ES el dato.
      setError("No se pudo contactar al servidor. Puede estar reiniciándose.");
    } finally {
      cargandoRef.current = false;
      setCargando(false);
    }
  }, []);

  // Cada refresco cuesta ~13 consultas (las 5 de latencia, los 7 conteos y
  // la de estadísticas), así que una pestaña olvidada en segundo plano
  // estaría martillando la base indefinidamente sin que nadie la mire —
  // con una base remota, a ~30 ms por viaje, eso es medio segundo de base cada
  // 10 s, para nada. `visibilitychange` corta eso y además dispara un
  // refresco al volver, para no quedarse mirando un número viejo.
  useEffect(() => {
    if (!enVivo) return;

    let id: ReturnType<typeof setInterval> | null = null;

    function arrancar() {
      if (id === null) id = setInterval(refrescar, INTERVALO_MS);
    }
    function detener() {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    }
    function alCambiarVisibilidad() {
      if (document.hidden) {
        detener();
      } else {
        void refrescar();
        arrancar();
      }
    }

    if (!document.hidden) arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      detener();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [enVivo, refrescar]);

  const { app, proceso, contenedor, baseDatos } = snapshot;

  const nivelMemoria = nivelPorUmbral(contenedor.memoriaPct, 75, 90);
  const nivelCpu = nivelPorUmbral(contenedor.cpuMuestraPct ?? proceso.cpuMuestraPct, 70, 90);
  const nivelLatencia = nivelPorUmbral(baseDatos.latenciaMedianaMs, 100, 300);
  const nivelConexiones = nivelPorUmbral(baseDatos.conexionesPct, 70, 90);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <RefreshCw className={cn("size-3.5", cargando && "animate-spin")} />
          Medido a las <span className="tabular-nums">{snapshot.generadoEn}</span>
        </span>
        <span className="tabular-nums">
          recolección {formatearMs(snapshot.recoleccionMs)}
        </span>
        {refrescadoEn ? (
          <span className="tabular-nums">último refresco {refrescadoEn}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refrescar} disabled={cargando}>
            <RefreshCw className={cn("size-4", cargando && "animate-spin")} />
            Actualizar
          </Button>
          <Button
            variant={enVivo ? "secondary" : "outline"}
            size="sm"
            onClick={() => setEnVivo((v) => !v)}
          >
            {enVivo ? "En vivo (10 s)" : "Pausado"}
          </Button>
        </div>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icono={MemoryStick}
          etiqueta="Memoria del contenedor"
          valor={formatearBytes(contenedor.memoriaUsadaBytes)}
          detalle={
            contenedor.memoriaConLimite
              ? `de ${formatearBytes(contenedor.memoriaLimiteBytes)} de cuota`
              : `de ${formatearBytes(contenedor.memoriaLimiteBytes)} de la máquina (sin cuota)`
          }
          pct={contenedor.memoriaPct}
          nivel={nivelMemoria}
        />
        <Tile
          icono={Cpu}
          etiqueta="CPU"
          valor={formatearPct(contenedor.cpuMuestraPct ?? proceso.cpuMuestraPct)}
          detalle={`${contenedor.nucleos} núcleo${contenedor.nucleos === 1 ? "" : "s"}${
            contenedor.nucleosConCuota ? " por cuota" : ""
          } · ${formatearPct(proceso.cpuPromedioPct)} promedio del proceso`}
          pct={contenedor.cpuMuestraPct ?? proceso.cpuMuestraPct}
          nivel={nivelCpu}
        />
        <Tile
          icono={Timer}
          etiqueta="Latencia a la base"
          valor={formatearMs(baseDatos.latenciaMedianaMs)}
          detalle={`mediana de ${baseDatos.latenciaMuestras} viajes · máx ${formatearMs(baseDatos.latenciaMaxMs)}`}
          nivel={nivelLatencia}
        />
        <Tile
          icono={Activity}
          etiqueta="Tiempo en pie"
          valor={formatearDuracion(app.uptimeSegundos)}
          detalle={`desde que arrancó el proceso · ${app.entorno}`}
          nivel="bien"
        />
      </div>

      <Seccion titulo="Tiempos de respuesta" icono={Gauge}>
        <TiemposDeRespuesta viajes={viajes} recoleccionMs={snapshot.recoleccionMs} />
      </Seccion>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Seccion titulo="Aplicación" icono={Server}>
          <ListaDatos
            datos={[
              ["Entorno", app.entorno],
              ["Node", app.versionNode],
              ["Plataforma", app.plataforma],
              ["Host", app.hostname],
              ["En pie desde hace", formatearDuracion(app.uptimeSegundos)],
              [
                "Carga de la máquina",
                app.uptimeSegundos > 0
                  ? contenedor.cargaPromedio.map((c) => c.toFixed(2)).join(" · ")
                  : "—",
                "1 / 5 / 15 min — es de la máquina anfitriona, no del contenedor",
              ],
            ]}
          />
        </Seccion>

        <Seccion titulo="Proceso de Node" icono={HardDrive}>
          <ListaDatos
            datos={[
              ["Residente (RSS)", formatearBytes(proceso.rssBytes)],
              [
                "Heap",
                `${formatearBytes(proceso.heapUsadoBytes)} de ${formatearBytes(proceso.heapTotalBytes)}`,
              ],
              ["Fuera del heap", formatearBytes(proceso.externoBytes)],
              [
                "CPU ahora",
                formatearPct(proceso.cpuMuestraPct),
                "muestra de 250 ms — una instancia ociosa marca 0%",
              ],
              ["CPU promedio", formatearPct(proceso.cpuPromedioPct), "desde que arrancó"],
              [
                "Fuente de la memoria",
                contenedor.fuente === "cgroup" ? "cgroup v2 (el contenedor)" : "sistema operativo (la máquina)",
              ],
            ]}
          />
        </Seccion>
      </div>

      <Seccion titulo="Base de datos" icono={Database}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ListaDatos
            datos={[
              ["Versión", baseDatos.version],
              ["Tamaño", formatearBytes(baseDatos.tamanoBytes)],
              [
                "Conexiones",
                baseDatos.maxConexiones
                  ? `${baseDatos.conexionesTotales} de ${baseDatos.maxConexiones} (${baseDatos.conexionesActivas} activa${baseDatos.conexionesActivas === 1 ? "" : "s"})`
                  : `${baseDatos.conexionesTotales} (${baseDatos.conexionesActivas} activas)`,
                undefined,
                NIVEL[nivelConexiones].clase,
              ],
              [
                "Latencia",
                `${formatearMs(baseDatos.latenciaMinMs)} / ${formatearMs(baseDatos.latenciaMedianaMs)} / ${formatearMs(baseDatos.latenciaMaxMs)}`,
                "mínimo / mediana / máximo de SELECT 1",
              ],
              [
                "Arrancada",
                baseDatos.arrancadaEn ?? "—",
                baseDatos.arrancadaHace ?? undefined,
              ],
            ]}
          />

          <PanelTabla>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabla</TableHead>
                  <TableHead className="text-right">Filas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baseDatos.tablas.map((t) => (
                  <TableRow key={t.nombre}>
                    <TableCell>{t.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.filas.toLocaleString("es-MX")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelTabla>
        </div>
      </Seccion>
    </div>
  );
}

function formatearPct(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  // El techo en 100 no es cosmético: con la ventana de muestreo y varios
  // procesos hijos (next dev), la suma puede pasarse por unas décimas, y un
  // "103%" en un panel de salud se lee como un bug del panel.
  return `${Math.min(100, Math.max(0, valor)).toFixed(1)}%`;
}

function Tile({
  icono: Icono,
  etiqueta,
  valor,
  detalle,
  pct,
  nivel,
}: {
  icono: typeof Cpu;
  etiqueta: string;
  valor: string;
  detalle: string;
  pct?: number | null;
  nivel: NivelSalud;
}) {
  const estilo = NIVEL[nivel];

  return (
    <div className="flex flex-col rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-muted", estilo.clase)}>
          <Icono className="size-5" />
        </div>
        {nivel !== "bien" ? (
          <Badge variant="outline" className={estilo.clase}>
            {estilo.palabra}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{etiqueta}</p>
      <p className="font-heading text-2xl font-bold tabular-nums">{valor}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>

      {pct !== undefined && pct !== null ? (
        // La barra repite el porcentaje que ya está escrito arriba, así que
        // es decoración para un lector de pantalla: aria-hidden y fuera.
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-all", estilo.claseFondo)}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Seccion({
  titulo,
  icono: Icono,
  children,
}: {
  titulo: string;
  icono: typeof Cpu;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
        <Icono className="size-4 text-muted-foreground" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

type RenglonDato = [string, string, string?, string?];

function ListaDatos({ datos }: { datos: RenglonDato[] }) {
  return (
    <dl className="flex flex-col rounded-xl border bg-card">
      {datos.map(([etiqueta, valor, ayuda, claseValor], i) => (
        <div
          key={etiqueta}
          className={cn(
            // En móvil apilado (la etiqueta no compite con el valor por 360
            // px), en pantalla ancha en dos columnas.
            "flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4",
            i > 0 && "border-t"
          )}
        >
          <dt className="shrink-0 text-sm text-muted-foreground">{etiqueta}</dt>
          <dd className="min-w-0 sm:text-right">
            <span className={cn("text-sm font-medium break-words tabular-nums", claseValor)}>
              {valor}
            </span>
            {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TiemposDeRespuesta({
  viajes,
  recoleccionMs,
}: {
  viajes: number[];
  recoleccionMs: number;
}) {
  if (viajes.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Cada refresco mide el viaje redondo completo desde este navegador hasta el servidor y de
          vuelta. Todavía no hay ninguno — el primero llega en unos segundos, o presiona
          &laquo;Actualizar&raquo;.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          El servidor tardó <span className="tabular-nums">{formatearMs(recoleccionMs)}</span> en
          juntar estas métricas.
        </p>
      </div>
    );
  }

  const ultimo = viajes[viajes.length - 1];
  const med = mediana(viajes);
  const maximo = Math.max(...viajes);
  // La escala se fija con el máximo observado: con un eje fijo, un panel
  // sano dibujaría barras invisibles y uno enfermo las saldría de rango.
  const escala = Math.max(maximo, 1);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metrica etiqueta="Último viaje" valor={formatearMs(ultimo)} />
        <Metrica etiqueta="Mediana" valor={formatearMs(med)} />
        <Metrica etiqueta="Máximo" valor={formatearMs(maximo)} />
        <Metrica etiqueta="Muestras" valor={String(viajes.length)} />
      </div>

      <div>
        <div className="flex h-16 items-end gap-1" aria-hidden>
          {viajes.map((v, i) => (
            <div
              key={i}
              className="min-w-1 flex-1 rounded-t-sm bg-primary/70"
              style={{ height: `${Math.max(4, (v / escala) * 100)}%` }}
              title={formatearMs(v)}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Viaje redondo navegador → servidor → navegador de cada refresco, el más reciente a la
          derecha (últimos {MUESTRAS_VISIBLES}). Incluye la red, la cola del servidor y los{" "}
          <span className="tabular-nums">{formatearMs(recoleccionMs)}</span> que costó juntar las
          métricas — por eso siempre es mayor que la latencia a la base.
        </p>
      </div>
    </div>
  );
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{etiqueta}</p>
      <p className="font-heading text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}
