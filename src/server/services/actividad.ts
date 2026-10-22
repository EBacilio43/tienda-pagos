import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { decimalAString } from "@/lib/money";
import { fechaAString, fechaHoraAString } from "@/lib/fecha";
import type { ActividadItemDTO, TipoActividad, DiaActividadDTO } from "@/types/dominio";

// Feed de actividad reciente cruzando TODOS los clientes — a diferencia de
// obtenerLedgerCliente (estado-cuenta.ts), que está scopeado a un cliente y
// cuyo llamador (obtenerDatosEstadoCuenta) hace un loop por cliente tope
// 50, esto NO reusa ese loop: son 3 findMany sin filtro de cliente, cada
// uno con su propio orderBy + take, mezclados en memoria una sola vez. Ver
// migración 20260810142623 — sin el índice en fecha_registro_sistema esto
// sería table scan completo en las tres tablas.
export type { TipoActividad, ActividadItemDTO, DiaActividadDTO };

type ActividadCruda = ActividadItemDTO & { ordenamiento: number };

// fecha_registro_sistema es la hora real de inserción (Timestamp, no el
// DATE de negocio "fecha" que regla 2 protege) — es el criterio correcto
// para "qué pasó más recientemente". Nullable solo en filas migradas muy
// viejas; para esas se usa medianoche UTC de `fecha` como respaldo, tanto
// para ordenar como para mostrar (sin hora, con <Fecha/>-equivalente).
function claveOrdenYTexto(fechaRegistro: Date | null, fecha: Date): { orden: number; texto: string } {
  if (fechaRegistro) {
    return { orden: fechaRegistro.getTime(), texto: fechaHoraAString(fechaRegistro) };
  }
  return { orden: fecha.getTime(), texto: fechaAString(fecha) };
}

const VENTA_SELECT = {
  id: true,
  fecha: true,
  fechaRegistroSistema: true,
  esquemaPago: true,
  montoTotal: true,
  tieneEnganche: true,
  enganche: true,
  cliente: { select: { id: true, nombre: true } },
} as const;

const PAGO_SELECT = {
  id: true,
  fecha: true,
  fechaRegistroSistema: true,
  metodoPago: true,
  monto: true,
  cliente: { select: { id: true, nombre: true } },
} as const;

const DEVOLUCION_SELECT = {
  id: true,
  fecha: true,
  fechaRegistroSistema: true,
  motivo: true,
  montoCredito: true,
  cliente: { select: { id: true, nombre: true } },
} as const;

type VentaConCliente = Prisma.VentaGetPayload<{
  select: typeof VENTA_SELECT;
}>;
type PagoConCliente = Prisma.PagoGetPayload<{
  select: typeof PAGO_SELECT;
}>;
type DevolucionConCliente = Prisma.DevolucionGetPayload<{
  select: typeof DEVOLUCION_SELECT;
}>;

const ORDEN_RECIENTE = [
  { fechaRegistroSistema: { sort: "desc" as const, nulls: "last" as const } },
  { fecha: "desc" as const },
  { id: "desc" as const },
];

// Las filas crudas a items del feed, ordenados de más reciente a más
// antiguo. Lo usan los dos llamadores —el feed de los últimos N y el de un
// día concreto del calendario—, que solo se diferencian en el `where` de
// las tres consultas. Estaba en línea dentro de listarActividadReciente; se
// extrajo al agregar el calendario en vez de copiarlo, porque la regla del
// enganche (que no es una fila, es un campo de su venta) es justo la que se
// olvida al mantener dos copias.
function construirItems(
  ventas: VentaConCliente[],
  pagos: PagoConCliente[],
  devoluciones: DevolucionConCliente[]
): ActividadCruda[] {
  const items: ActividadCruda[] = [];

  for (const v of ventas) {
    const { orden, texto } = claveOrdenYTexto(v.fechaRegistroSistema, v.fecha);
    items.push({
      id: `venta-${v.id}`,
      tipo: "venta",
      fechaTexto: texto,
      clienteId: v.cliente.id,
      clienteNombre: v.cliente.nombre,
      detalle: v.esquemaPago ?? null,
      monto: decimalAString(v.montoTotal ?? new Prisma.Decimal(0)),
      ordenamiento: orden,
    });
    if (v.tieneEnganche && v.enganche && v.enganche.greaterThan(0)) {
      items.push({
        id: `enganche-${v.id}`,
        tipo: "enganche",
        fechaTexto: texto,
        clienteId: v.cliente.id,
        clienteNombre: v.cliente.nombre,
        detalle: `Enganche de venta #${v.id}`,
        monto: decimalAString(v.enganche),
        ordenamiento: orden + 1, // desempate: el enganche va justo después de su venta
      });
    }
  }

  for (const p of pagos) {
    const { orden, texto } = claveOrdenYTexto(p.fechaRegistroSistema, p.fecha);
    items.push({
      id: `pago-${p.id}`,
      tipo: "pago",
      fechaTexto: texto,
      clienteId: p.cliente.id,
      clienteNombre: p.cliente.nombre,
      detalle: p.metodoPago ?? null,
      monto: decimalAString(p.monto),
      ordenamiento: orden,
    });
  }

  for (const d of devoluciones) {
    const { orden, texto } = claveOrdenYTexto(d.fechaRegistroSistema, d.fecha);
    items.push({
      id: `devolucion-${d.id}`,
      tipo: "devolucion",
      fechaTexto: texto,
      clienteId: d.cliente.id,
      clienteNombre: d.cliente.nombre,
      detalle: d.motivo ?? null,
      monto: decimalAString(d.montoCredito),
      ordenamiento: orden,
    });
  }

  items.sort((a, b) => b.ordenamiento - a.ordenamiento);
  return items;
}

function aDTO(items: ActividadCruda[]): ActividadItemDTO[] {
  return items.map(
    (item): ActividadItemDTO => ({
      id: item.id,
      tipo: item.tipo,
      fechaTexto: item.fechaTexto,
      clienteId: item.clienteId,
      clienteNombre: item.clienteNombre,
      detalle: item.detalle,
      monto: item.monto,
    })
  );
}

export async function listarActividadReciente(limite: number): Promise<ActividadItemDTO[]> {
  const [ventas, pagos, devoluciones] = await Promise.all([
    prisma.venta.findMany({ take: limite, orderBy: ORDEN_RECIENTE, select: VENTA_SELECT }),
    prisma.pago.findMany({ take: limite, orderBy: ORDEN_RECIENTE, select: PAGO_SELECT }),
    prisma.devolucion.findMany({ take: limite, orderBy: ORDEN_RECIENTE, select: DEVOLUCION_SELECT }),
  ]);

  // El slice va DESPUÉS de mezclar: cada consulta trae sus propios `limite`
  // y la mezcla puede dejar fuera a cualquiera de las tres.
  return aDTO(construirItems(ventas, pagos, devoluciones).slice(0, limite));
}

// ─────────────────────────────────────────────────────────────────────────
// Calendario de /actividad
//
// LA DECISIÓN QUE IMPORTA AQUÍ: el calendario agrupa por `fecha` (la
// columna DATE de negocio, regla 2), NO por `fecha_registro_sistema` como
// hace el feed de arriba. No son lo mismo y la diferencia no es teórica:
// al capturar o importar movimientos pasados, las fechas de negocio difieren
// de la fecha del sistema en que se insertan. Agrupando por la hora de inserción,
// el calendario mostraría un solo día de captura masiva y los días reales vacíos.
//
// "Qué pasó tal día" es una pregunta sobre el negocio, y la responde
// `fecha`. El feed pregunta otra cosa —"qué se capturó al último"— y por
// eso conserva su propio criterio.
//
// No hay índice sobre `fecha` (solo sobre `id_cliente` y
// `fecha_registro_sistema`) y no se agrega: para evitar índices prematuros
// sin volumen que lo justifique (regla 9).

const LIMITE_DIA = 200;

function rangoUTC(desde: string, hasta: string) {
  return { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) };
}

/**
 * Agregado por día para el rango visible de la cuadrícula — que NO es el
 * mes: la primera y la última semana enseñan días del mes vecino, y si la
 * consulta se limitara al mes esas celdas dirían "sin actividad" teniendo.
 *
 * Son cuatro `groupBy` constantes, no una consulta por celda. El enganche
 * necesita el suyo porque es una suma condicionada (`tiene_enganche`) sobre
 * la misma tabla que los cargos, y Prisma no expresa dos sumas con filtros
 * distintos en un solo groupBy.
 */
export async function resumenDeActividadPorDia(
  desde: string,
  hasta: string
): Promise<DiaActividadDTO[]> {
  const fecha = rangoUTC(desde, hasta);

  const [ventas, enganches, pagos, devoluciones] = await Promise.all([
    prisma.venta.groupBy({
      by: ["fecha"],
      where: { fecha },
      _sum: { montoTotal: true },
      _count: { _all: true },
    }),
    prisma.venta.groupBy({
      by: ["fecha"],
      where: { fecha, tieneEnganche: true, enganche: { gt: 0 } },
      _sum: { enganche: true },
      _count: { _all: true },
    }),
    prisma.pago.groupBy({
      by: ["fecha"],
      where: { fecha },
      _sum: { monto: true },
      _count: { _all: true },
    }),
    prisma.devolucion.groupBy({
      by: ["fecha"],
      where: { fecha },
      _sum: { montoCredito: true },
      _count: { _all: true },
    }),
  ]);

  // Los totales se acumulan como Decimal y solo cruzan a string al final
  // (regla 1): sumar montos ya formateados obligaría a re-parsear.
  const porDia = new Map<
    string,
    { cargos: Prisma.Decimal; abonos: Prisma.Decimal; movimientos: number }
  >();

  const acumular = (
    dia: Date,
    columna: "cargos" | "abonos",
    monto: Prisma.Decimal | null,
    cuantos: number
  ) => {
    const clave = fechaAString(dia);
    const actual =
      porDia.get(clave) ??
      { cargos: new Prisma.Decimal(0), abonos: new Prisma.Decimal(0), movimientos: 0 };
    actual[columna] = actual[columna].plus(monto ?? 0);
    actual.movimientos += cuantos;
    porDia.set(clave, actual);
  };

  for (const v of ventas) acumular(v.fecha, "cargos", v._sum.montoTotal, v._count._all);
  for (const e of enganches) acumular(e.fecha, "abonos", e._sum.enganche, e._count._all);
  for (const p of pagos) acumular(p.fecha, "abonos", p._sum.monto, p._count._all);
  for (const d of devoluciones)
    acumular(d.fecha, "abonos", d._sum.montoCredito, d._count._all);

  return [...porDia.entries()]
    .map(([fechaDia, t]) => ({
      fecha: fechaDia,
      cargos: decimalAString(t.cargos),
      abonos: decimalAString(t.abonos),
      movimientos: t.movimientos,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Los movimientos de un solo día del calendario, con el mismo formato que
 * el feed — se pintan con el mismo `<ListaActividad>`.
 *
 * Filtra por `fecha`, igual que el agregado de arriba, para que la lista
 * cuadre con la cifra de la celda que se acaba de tocar. Ordenar sí sigue
 * usando la hora de captura: dentro de un mismo día es el único criterio
 * que distingue un movimiento de otro.
 */
export async function listarActividadDelDia(dia: string): Promise<ActividadItemDTO[]> {
  const fecha = rangoUTC(dia, dia);

  const [ventas, pagos, devoluciones] = await Promise.all([
    prisma.venta.findMany({
      where: { fecha },
      take: LIMITE_DIA,
      orderBy: ORDEN_RECIENTE,
      select: VENTA_SELECT,
    }),
    prisma.pago.findMany({
      where: { fecha },
      take: LIMITE_DIA,
      orderBy: ORDEN_RECIENTE,
      select: PAGO_SELECT,
    }),
    prisma.devolucion.findMany({
      where: { fecha },
      take: LIMITE_DIA,
      orderBy: ORDEN_RECIENTE,
      select: DEVOLUCION_SELECT,
    }),
  ]);

  return aDTO(construirItems(ventas, pagos, devoluciones));
}
