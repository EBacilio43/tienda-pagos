import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { obtenerTodosLosSaldos } from "./saldo";
import { primerDiaDelMesUTC, primerDiaMesAnteriorUTC, haceNDiasUTC, fechaAString } from "@/lib/fecha";
import { decimalAString } from "@/lib/money";

export type ClienteSaldoAlertaDTO = {
  id: number;
  nombre: string;
  saldo: string;
  ultimoAbono: string | null; // YYYY-MM-DD; null = nunca ha abonado
};

export type DashboardDTO = {
  totalClientes: number;
  ventasMes: string;
  ventasMesCambioPct: number | null;
  abonosMes: string;
  abonosMesCambioPct: number | null;
  abonosSemana: string;
  itemsBajoMinimo: number;
  saldoPendienteTotal: string;
  clientesConSaldo: number;
  topClientesSaldo: ClienteSaldoAlertaDTO[];
  clientesSinAbonoReciente: ClienteSaldoAlertaDTO[];
};

const LIMITE_LISTAS = 5;
const DIAS_SIN_ABONO = 30;

function cambioPct(actual: Prisma.Decimal, anterior: Prisma.Decimal): number | null {
  if (anterior.isZero()) return null;
  return actual.minus(anterior).dividedBy(anterior).times(100).toDecimalPlaces(0).toNumber();
}

export async function obtenerDashboard(): Promise<DashboardDTO> {
  const inicioVentana = primerDiaMesAnteriorUTC(); // 1º del mes pasado — cubre ambos meses y la semana
  const inicioMesActual = primerDiaDelMesUTC();
  const inicioSemana = haceNDiasUTC(6); // últimos 7 días incluyendo hoy

  // Eliminamos prisma.cliente.count() redundante: clientesTodos ya trae
  // id y nombre de todos los clientes en una sola pasada.
  const [catalogoActivo, saldos, ventasVentana, pagosVentana, ultimosPagos, clientesTodos] =
    await Promise.all([
      prisma.catalogo.findMany({
        where: { activo: true, stockMinimo: { gt: 0 } },
        select: { stock: true, stockMinimo: true },
      }),
      obtenerTodosLosSaldos(),
      prisma.venta.findMany({
        where: { fecha: { gte: inicioVentana } },
        select: { fecha: true, montoTotal: true, tieneEnganche: true, enganche: true },
      }),
      prisma.pago.findMany({
        where: { fecha: { gte: inicioVentana } },
        select: { fecha: true, monto: true },
      }),
      prisma.pago.groupBy({ by: ["idCliente"], _max: { fecha: true } }),
      prisma.cliente.findMany({ select: { id: true, nombre: true } }),
    ]);

  const totalClientes = clientesTodos.length;
  const itemsBajoMinimo = catalogoActivo.filter((a) => a.stock <= a.stockMinimo).length;

  // Ventas y abonos por ventana de tiempo. El enganche cuenta como abono
  // (docs/DOMINIO.md: "abono inmediato asociado a la venta") así que se
  // suma junto con pagos.monto, no aparte.
  let ventasMes = new Prisma.Decimal(0);
  let ventasMesAnterior = new Prisma.Decimal(0);
  let abonosMes = new Prisma.Decimal(0);
  let abonosMesAnterior = new Prisma.Decimal(0);
  let abonosSemana = new Prisma.Decimal(0);

  for (const v of ventasVentana) {
    const monto = v.montoTotal ?? new Prisma.Decimal(0);
    const engancheMonto = v.tieneEnganche && v.enganche ? v.enganche : new Prisma.Decimal(0);
    if (v.fecha >= inicioMesActual) {
      ventasMes = ventasMes.plus(monto);
      abonosMes = abonosMes.plus(engancheMonto);
    } else {
      ventasMesAnterior = ventasMesAnterior.plus(monto);
      abonosMesAnterior = abonosMesAnterior.plus(engancheMonto);
    }
    if (v.fecha >= inicioSemana) {
      abonosSemana = abonosSemana.plus(engancheMonto);
    }
  }

  for (const p of pagosVentana) {
    if (p.fecha >= inicioMesActual) {
      abonosMes = abonosMes.plus(p.monto);
    } else {
      abonosMesAnterior = abonosMesAnterior.plus(p.monto);
    }
    if (p.fecha >= inicioSemana) {
      abonosSemana = abonosSemana.plus(p.monto);
    }
  }

  // Suma solo lo positivo (dinero realmente pendiente de cobro) — a
  // diferencia del legacy (logic.py:809), que trunca el TOTAL agregado a
  // 0 en vez de nunca dejar que el saldo a favor de un cliente le reste al
  // total pendiente de otro. El saldo de cada cliente individual, en
  // cambio, nunca se trunca (docs/DOMINIO.md).
  let saldoPendienteTotal = new Prisma.Decimal(0);
  let clientesConSaldo = 0;
  const conSaldoPositivo: { id: number; saldo: Prisma.Decimal }[] = [];
  for (const [id, saldo] of saldos) {
    if (saldo.greaterThan(0)) {
      saldoPendienteTotal = saldoPendienteTotal.plus(saldo);
      clientesConSaldo += 1;
      conSaldoPositivo.push({ id, saldo });
    }
  }

  const nombrePorCliente = new Map(clientesTodos.map((c) => [c.id, c.nombre]));
  const ultimoAbonoPorCliente = new Map(
    ultimosPagos.filter((u) => u._max.fecha !== null).map((u) => [u.idCliente, u._max.fecha as Date])
  );

  const aDto = (c: { id: number; saldo: Prisma.Decimal }): ClienteSaldoAlertaDTO => {
    const ultimo = ultimoAbonoPorCliente.get(c.id);
    return {
      id: c.id,
      nombre: nombrePorCliente.get(c.id) ?? "—",
      saldo: decimalAString(c.saldo),
      ultimoAbono: ultimo ? fechaAString(ultimo) : null,
    };
  };

  const topClientesSaldo = [...conSaldoPositivo]
    .sort((a, b) => b.saldo.comparedTo(a.saldo))
    .slice(0, LIMITE_LISTAS)
    .map(aDto);

  const umbralSinAbono = haceNDiasUTC(DIAS_SIN_ABONO - 1);
  const clientesSinAbonoReciente = conSaldoPositivo
    .filter((c) => {
      const ultimo = ultimoAbonoPorCliente.get(c.id);
      return !ultimo || ultimo < umbralSinAbono;
    })
    .sort((a, b) => {
      const ua = ultimoAbonoPorCliente.get(a.id);
      const ub = ultimoAbonoPorCliente.get(b.id);
      if (!ua && !ub) return b.saldo.comparedTo(a.saldo);
      if (!ua) return -1;
      if (!ub) return 1;
      return ua.getTime() - ub.getTime();
    })
    .slice(0, LIMITE_LISTAS)
    .map(aDto);

  return {
    totalClientes,
    ventasMes: decimalAString(ventasMes),
    ventasMesCambioPct: cambioPct(ventasMes, ventasMesAnterior),
    abonosMes: decimalAString(abonosMes),
    abonosMesCambioPct: cambioPct(abonosMes, abonosMesAnterior),
    abonosSemana: decimalAString(abonosSemana),
    itemsBajoMinimo,
    saldoPendienteTotal: decimalAString(saldoPendienteTotal),
    clientesConSaldo,
    topClientesSaldo,
    clientesSinAbonoReciente,
  };
}
