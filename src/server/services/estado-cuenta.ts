import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { decimalAString } from "@/lib/money";
import { fechaAString } from "@/lib/fecha";
import { obtenerResumenesSaldo, type ResumenSaldoDTO } from "./saldo";
import type { ArticuloMovimiento } from "@/types/dominio";

export type { ArticuloMovimiento };

// Ledger compartido (UI + PDF en Fase 5). docs/DOMINIO.md: una sola fila de
// "Venta" por venta usando ventas.monto_total — no una fila por artículo —
// así el ledger y v_saldos_cliente.sql usan el mismo número por
// construcción y nunca pueden desalinearse.
export type MovimientoLedger = {
  id: string;
  fecha: string;
  tipo: "venta" | "enganche" | "pago" | "devolucion";
  descripcion: string;
  detalle: string;
  cargo: string | null;
  abono: string | null;
  saldoAcumulado: string;
  // Desglose pieza por pieza del movimiento, para que el estado de cuenta
  // —pantalla y PDF— pueda decir a qué precio entró cada una y no solo un
  // total con los nombres pegados. Vacío en abonos y enganches, que no
  // tienen piezas, y también en una venta capturada sin desglosar (las hay:
  // hay libretas que anotan el total de la venta y ya).
  //
  // `precioUnitario` es nullable porque la columna lo es desde el esquema
  // legacy: una pieza sin precio se muestra como "—", que es la verdad, en
  // vez de un $0.00 que parecería un regalo.
  articulos: ArticuloMovimiento[];
};

export function desglosar(
  articulos: { nombre: string; cantidad: number | null; precioUnitario: Prisma.Decimal | null }[]
): ArticuloMovimiento[] {
  return articulos.map((a) => {
    const cantidad = a.cantidad ?? 0;
    const precioUnitario = a.precioUnitario ? decimalAString(a.precioUnitario) : null;
    return {
      nombre: a.nombre,
      cantidad,
      precioUnitario,
      subtotal: a.precioUnitario ? decimalAString(a.precioUnitario.times(cantidad)) : null,
    };
  });
}

// Formas estructurales de lo que necesita el ledger — así la construcción
// es pura y la comparten el camino por cliente (la UI) y el camino en lote
// (el PDF), sin dos implementaciones del running balance que puedan
// divergir.
type VentaLedger = {
  id: number;
  fecha: Date;
  esquemaPago: string | null;
  montoTotal: Prisma.Decimal | null;
  tieneEnganche: boolean | null;
  enganche: Prisma.Decimal | null;
  ventaArticulos: { nombre: string; cantidad: number | null; precioUnitario: Prisma.Decimal | null }[];
};
type PagoLedger = {
  id: number;
  fecha: Date;
  monto: Prisma.Decimal;
  metodoPago: string | null;
  referencia: string | null;
};
type DevolucionLedger = {
  id: number;
  fecha: Date;
  montoCredito: Prisma.Decimal;
  motivo: string | null;
  devolucionArticulos: {
    nombre: string;
    cantidad: number | null;
    precioUnitario: Prisma.Decimal | null;
    precioCredito: Prisma.Decimal | null;
  }[];
};

function construirLedger(
  ventas: VentaLedger[],
  pagos: PagoLedger[],
  devoluciones: DevolucionLedger[]
): MovimientoLedger[] {
  type Cruda = Omit<MovimientoLedger, "saldoAcumulado"> & { orden: number };
  const movimientos: Cruda[] = [];

  for (const v of ventas) {
    movimientos.push({
      id: `venta-${v.id}`,
      fecha: fechaAString(v.fecha),
      tipo: "venta",
      descripcion: v.ventaArticulos.map((a) => `${a.cantidad ?? 0}x ${a.nombre}`).join(", "),
      detalle: v.esquemaPago ?? "",
      cargo: decimalAString(v.montoTotal ?? new Prisma.Decimal(0)),
      abono: null,
      articulos: desglosar(v.ventaArticulos),
      orden: v.id * 10,
    });
    if (v.tieneEnganche && v.enganche && v.enganche.greaterThan(0)) {
      movimientos.push({
        id: `enganche-${v.id}`,
        fecha: fechaAString(v.fecha),
        tipo: "enganche",
        descripcion: `Enganche de venta #${v.id}`,
        detalle: v.esquemaPago ?? "",
        cargo: null,
        abono: decimalAString(v.enganche),
        articulos: [],
        orden: v.id * 10 + 1,
      });
    }
  }

  for (const p of pagos) {
    movimientos.push({
      id: `pago-${p.id}`,
      fecha: fechaAString(p.fecha),
      tipo: "pago",
      descripcion: p.metodoPago ?? "Pago",
      detalle: p.referencia ?? "",
      cargo: null,
      abono: decimalAString(p.monto),
      articulos: [],
      orden: p.id * 10,
    });
  }

  for (const d of devoluciones) {
    movimientos.push({
      id: `devolucion-${d.id}`,
      fecha: fechaAString(d.fecha),
      tipo: "devolucion",
      descripcion: d.devolucionArticulos
        .map((a) => `${a.cantidad ?? 0}x ${a.nombre}`)
        .join(", "),
      detalle: d.motivo ?? "",
      cargo: null,
      abono: decimalAString(d.montoCredito),
      articulos: desglosar(
        d.devolucionArticulos.map((a) => ({ ...a, precioUnitario: a.precioCredito ?? a.precioUnitario }))
      ),
      orden: d.id * 10,
    });
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

  let saldoAcumulado = new Prisma.Decimal(0);
  return movimientos.map((m): MovimientoLedger => {
    if (m.cargo) saldoAcumulado = saldoAcumulado.plus(m.cargo);
    if (m.abono) saldoAcumulado = saldoAcumulado.minus(m.abono);
    return {
      id: m.id,
      fecha: m.fecha,
      tipo: m.tipo,
      descripcion: m.descripcion,
      detalle: m.detalle,
      cargo: m.cargo,
      abono: m.abono,
      articulos: m.articulos,
      saldoAcumulado: decimalAString(saldoAcumulado),
    };
  });
}

export async function obtenerLedgerCliente(clienteId: number): Promise<MovimientoLedger[]> {
  const [ventas, pagos, devoluciones] = await Promise.all([
    prisma.venta.findMany({
      where: { idCliente: clienteId },
      select: {
        id: true,
        fecha: true,
        esquemaPago: true,
        montoTotal: true,
        tieneEnganche: true,
        enganche: true,
        ventaArticulos: {
          select: {
            nombre: true,
            cantidad: true,
            precioUnitario: true,
          },
        },
      },
    }),
    prisma.pago.findMany({
      where: { idCliente: clienteId },
      select: {
        id: true,
        fecha: true,
        monto: true,
        metodoPago: true,
        referencia: true,
      },
    }),
    prisma.devolucion.findMany({
      where: { idCliente: clienteId },
      select: {
        id: true,
        fecha: true,
        montoCredito: true,
        motivo: true,
        devolucionArticulos: {
          select: {
            nombre: true,
            cantidad: true,
            precioUnitario: true,
            precioCredito: true,
          },
        },
      },
    }),
  ]);

  return construirLedger(ventas, pagos, devoluciones);
}

// Versión en lote: 3 consultas para todos los clientes, en vez de 3 por
// cliente dentro de un bucle. Agrupa en memoria y reusa `construirLedger`,
// así el orden y el saldo corriente son los mismos por construcción.
async function obtenerLedgersClientes(
  clienteIds: number[]
): Promise<Map<number, MovimientoLedger[]>> {
  const resultado = new Map<number, MovimientoLedger[]>();
  if (clienteIds.length === 0) return resultado;

  const where = { idCliente: { in: clienteIds } };
  const [ventas, pagos, devoluciones] = await Promise.all([
    prisma.venta.findMany({
      where,
      select: {
        id: true,
        idCliente: true,
        fecha: true,
        esquemaPago: true,
        montoTotal: true,
        tieneEnganche: true,
        enganche: true,
        ventaArticulos: {
          select: {
            nombre: true,
            cantidad: true,
            precioUnitario: true,
          },
        },
      },
    }),
    prisma.pago.findMany({
      where,
      select: {
        id: true,
        idCliente: true,
        fecha: true,
        monto: true,
        metodoPago: true,
        referencia: true,
      },
    }),
    prisma.devolucion.findMany({
      where,
      select: {
        id: true,
        idCliente: true,
        fecha: true,
        montoCredito: true,
        motivo: true,
        devolucionArticulos: {
          select: {
            nombre: true,
            cantidad: true,
            precioUnitario: true,
            precioCredito: true,
          },
        },
      },
    }),
  ]);

  function agrupar<T extends { idCliente: number }>(filas: T[]): Map<number, T[]> {
    const mapa = new Map<number, T[]>();
    for (const fila of filas) {
      const actual = mapa.get(fila.idCliente);
      if (actual) actual.push(fila);
      else mapa.set(fila.idCliente, [fila]);
    }
    return mapa;
  }

  const ventasPorCliente = agrupar(ventas);
  const pagosPorCliente = agrupar(pagos);
  const devolucionesPorCliente = agrupar(devoluciones);

  for (const id of clienteIds) {
    resultado.set(
      id,
      construirLedger(
        ventasPorCliente.get(id) ?? [],
        pagosPorCliente.get(id) ?? [],
        devolucionesPorCliente.get(id) ?? []
      )
    );
  }
  return resultado;
}

export type ClienteEstadoCuentaDTO = {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  fechaRegistro: string | null;
  movimientos: MovimientoLedger[];
  resumen: ResumenSaldoDTO;
};

// Para el PDF (Fase 5) — junta lo que ya arma cada servicio, sin
// reimplementar nada. Tope de 50 clientes por request (docs/PLAN.md).
//
// Antes era un `for` secuencial que llamaba obtenerClienteDetalle +
// obtenerLedgerCliente + obtenerResumenSaldo por cliente: 12 consultas y 3
// viajes secuenciales cada uno — 600 consultas y 150 viajes en el tope de
// 50. Con la BD local (<1 ms por viaje) no se notaba; contra una base remota, a
// ~30 ms por viaje, son ~4.5 s de pura red antes de empezar a renderizar.
// Ahora son 8 consultas en lote, constantes: el costo ya no crece con la
// cantidad de clientes seleccionados.
export async function obtenerDatosEstadoCuenta(
  clienteIds: number[]
): Promise<ClienteEstadoCuentaDTO[]> {
  const idsLimitados = clienteIds.slice(0, 50);
  if (idsLimitados.length === 0) return [];

  const [clientes, ledgers, resumenes] = await Promise.all([
    prisma.cliente.findMany({ where: { id: { in: idsLimitados } } }),
    obtenerLedgersClientes(idsLimitados),
    obtenerResumenesSaldo(idsLimitados),
  ]);

  const clientePorId = new Map(clientes.map((c) => [c.id, c]));

  // Se recorre `idsLimitados`, no `clientes`, para conservar el orden en que
  // los pidió quien llama (el PDF arma una página por cliente en ese orden)
  // — findMany no lo garantiza. Un id inexistente se salta, igual que antes.
  const resultados: ClienteEstadoCuentaDTO[] = [];
  for (const id of idsLimitados) {
    const cliente = clientePorId.get(id);
    const resumen = resumenes.get(id);
    if (!cliente || !resumen) continue;
    resultados.push({
      id: cliente.id,
      nombre: cliente.nombre,
      email: cliente.email,
      telefono: cliente.telefono,
      fechaRegistro: cliente.fechaRegistro ? fechaAString(cliente.fechaRegistro) : null,
      movimientos: ledgers.get(id) ?? [],
      resumen,
    });
  }

  return resultados;
}
