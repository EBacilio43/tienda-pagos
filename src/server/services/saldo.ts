import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { decimalAString } from "@/lib/money";

// AGENTS.md regla 3: única fuente del saldo. Envoltorio delgado sobre
// v_saldos_cliente (prisma/views/v_saldos_cliente.sql) — la fórmula vive
// ahí, no aquí. Puede ser negativo (cliente a favor, docs/DOMINIO.md).
const CERO = new Prisma.Decimal(0);

export async function obtenerSaldo(clienteId: number): Promise<Prisma.Decimal> {
  const fila = await prisma.vSaldoCliente.findUnique({ where: { clienteId } });
  return fila?.saldo ?? CERO;
}

export async function obtenerSaldos(
  clienteIds: number[]
): Promise<Map<number, Prisma.Decimal>> {
  if (clienteIds.length === 0) return new Map();
  const filas = await prisma.vSaldoCliente.findMany({
    where: { clienteId: { in: clienteIds } },
  });
  const mapa = new Map(filas.map((f) => [f.clienteId, f.saldo ?? CERO]));
  for (const id of clienteIds) {
    if (!mapa.has(id)) mapa.set(id, CERO);
  }
  return mapa;
}

export async function obtenerTodosLosSaldos(): Promise<Map<number, Prisma.Decimal>> {
  const filas = await prisma.vSaldoCliente.findMany();
  return new Map(filas.map((f) => [f.clienteId, f.saldo ?? CERO]));
}

export type ResumenSaldoDTO = {
  totalVentas: string;
  totalEnganches: string;
  totalPagos: string;
  totalDevoluciones: string;
  saldo: string;
};

// Versión en lote del desglose, para no repetir 5 consultas por cliente
// dentro de un bucle (era el N+1 del PDF multi-cliente: 12 consultas por
// cliente × 50 = 600). Mismos cuatro términos y misma regla 3 — el `saldo`
// sigue saliendo de la vista, aquí en una sola consulta para todos.
export async function obtenerResumenesSaldo(
  clienteIds: number[]
): Promise<Map<number, ResumenSaldoDTO>> {
  const resultado = new Map<number, ResumenSaldoDTO>();
  if (clienteIds.length === 0) return resultado;

  const where = { idCliente: { in: clienteIds } };
  const [ventasPorCliente, enganchesPorCliente, pagosPorCliente, devolucionesPorCliente, saldos] =
    await Promise.all([
      prisma.venta.groupBy({ by: ["idCliente"], _sum: { montoTotal: true }, where }),
      prisma.venta.groupBy({
        by: ["idCliente"],
        _sum: { enganche: true },
        where: { ...where, tieneEnganche: true },
      }),
      prisma.pago.groupBy({ by: ["idCliente"], _sum: { monto: true }, where }),
      prisma.devolucion.groupBy({ by: ["idCliente"], _sum: { montoCredito: true }, where }),
      obtenerSaldos(clienteIds),
    ]);

  const ventas = new Map(ventasPorCliente.map((v) => [v.idCliente, v._sum.montoTotal ?? CERO]));
  const enganches = new Map(enganchesPorCliente.map((v) => [v.idCliente, v._sum.enganche ?? CERO]));
  const pagos = new Map(pagosPorCliente.map((p) => [p.idCliente, p._sum.monto ?? CERO]));
  const devoluciones = new Map(
    devolucionesPorCliente.map((d) => [d.idCliente, d._sum.montoCredito ?? CERO])
  );

  for (const id of clienteIds) {
    resultado.set(id, {
      totalVentas: decimalAString(ventas.get(id) ?? CERO),
      totalEnganches: decimalAString(enganches.get(id) ?? CERO),
      totalPagos: decimalAString(pagos.get(id) ?? CERO),
      totalDevoluciones: decimalAString(devoluciones.get(id) ?? CERO),
      saldo: decimalAString(saldos.get(id) ?? CERO),
    });
  }
  return resultado;
}

// Desglose de los mismos cuatro términos de la fórmula, para el resumen del
// detalle de cliente (gui.py:1600-1614). No reimplementa la resta — el
// `saldo` final sigue viniendo de la vista.
export async function obtenerResumenSaldo(clienteId: number): Promise<ResumenSaldoDTO> {
  const [ventasAgg, engancheAgg, pagosAgg, devolucionesAgg, saldo] = await Promise.all([
    prisma.venta.aggregate({
      _sum: { montoTotal: true },
      where: { idCliente: clienteId },
    }),
    prisma.venta.aggregate({
      _sum: { enganche: true },
      where: { idCliente: clienteId, tieneEnganche: true },
    }),
    prisma.pago.aggregate({ _sum: { monto: true }, where: { idCliente: clienteId } }),
    prisma.devolucion.aggregate({
      _sum: { montoCredito: true },
      where: { idCliente: clienteId },
    }),
    obtenerSaldo(clienteId),
  ]);

  return {
    totalVentas: decimalAString(ventasAgg._sum.montoTotal ?? CERO),
    totalEnganches: decimalAString(engancheAgg._sum.enganche ?? CERO),
    totalPagos: decimalAString(pagosAgg._sum.monto ?? CERO),
    totalDevoluciones: decimalAString(devolucionesAgg._sum.montoCredito ?? CERO),
    saldo: decimalAString(saldo),
  };
}
