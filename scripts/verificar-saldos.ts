/**
 * Fase 2. "Listo cuando": para cada cliente, el saldo de v_saldos_cliente.sql
 * (fuente única — la usan dashboard, /clientes y /clientes/[id]), una
 * reconstrucción independiente desde las tablas crudas (equivalente a
 * `calcular_saldo` de logic.py:266-280) y el último renglón del ledger
 * (server/services/estado-cuenta.ts, running balance movimiento por
 * movimiento) son el mismo número.
 *
 * Uso: pnpm verificar-saldos
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { obtenerLedgerCliente } from "@/server/services/estado-cuenta";

const prisma = new PrismaClient();
const CERO = new Prisma.Decimal(0);

async function saldoCrudo(clienteId: number): Promise<Prisma.Decimal> {
  const [ventasAgg, engancheAgg, pagosAgg, devolucionesAgg] = await Promise.all([
    prisma.venta.aggregate({ _sum: { montoTotal: true }, where: { idCliente: clienteId } }),
    prisma.venta.aggregate({
      _sum: { enganche: true },
      where: { idCliente: clienteId, tieneEnganche: true },
    }),
    prisma.pago.aggregate({ _sum: { monto: true }, where: { idCliente: clienteId } }),
    prisma.devolucion.aggregate({
      _sum: { montoCredito: true },
      where: { idCliente: clienteId },
    }),
  ]);
  return (ventasAgg._sum.montoTotal ?? CERO)
    .minus(pagosAgg._sum.monto ?? CERO)
    .minus(devolucionesAgg._sum.montoCredito ?? CERO)
    .minus(engancheAgg._sum.enganche ?? CERO);
}

async function main() {
  const clientes = await prisma.cliente.findMany({
    select: { id: true, nombre: true },
    orderBy: { id: "asc" },
  });

  let discrepancias = 0;

  for (const cliente of clientes) {
    const fila = await prisma.vSaldoCliente.findUnique({
      where: { clienteId: cliente.id },
    });
    const saldoVista = fila?.saldo ?? CERO;

    const crudo = await saldoCrudo(cliente.id);

    const ledger = await obtenerLedgerCliente(cliente.id);
    const saldoLedger =
      ledger.length > 0 ? new Prisma.Decimal(ledger[ledger.length - 1].saldoAcumulado) : CERO;

    const iguales = saldoVista.equals(crudo) && saldoVista.equals(saldoLedger);
    if (!iguales) {
      discrepancias++;
      console.log(
        `✗ Cliente ${cliente.id} (${cliente.nombre}): vista=${saldoVista} crudo=${crudo} ledger=${saldoLedger}`
      );
    }
  }

  console.log(
    `\n${clientes.length} cliente(s) verificados, ${discrepancias} discrepancia(s).`
  );
  if (discrepancias > 0) {
    process.exitCode = 1;
  } else {
    console.log("✓ Vista, reconstrucción cruda y ledger coinciden para todos los clientes.");
  }
}

main()
  .catch((err) => {
    console.error("Error corriendo verificar-saldos:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
