import type { Prisma, PrismaClient } from "@prisma/client";

type ClienteTransaccional = PrismaClient | Prisma.TransactionClient;

/**
 * AGENTS.md regla 5: todo servicio mutante escribe su renglón de auditoría
 * dentro de la misma transacción, después de conocer el id del registro
 * afectado. `registroId` nunca queda `null` en un INSERT (a diferencia del
 * legacy, audit.py:54).
 */
export type RenglonAuditoria = {
  actorId: number | null;
  accion: string;
  tablaAfectada: string;
  registroId: string;
  datosAnteriores?: Prisma.InputJsonValue;
  datosNuevos?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

export async function registrarAuditoria(
  db: ClienteTransaccional,
  params: RenglonAuditoria
): Promise<void> {
  await db.auditoria.create({ data: aFila(params) });
}

/**
 * La misma fila de auditoría, pero para muchos registros en **un solo viaje**
 * a la base. No relaja la regla 5 —sigue siendo un renglón por registro, con
 * su `registro_id` real— sino que deja de pagar una ida y vuelta por cada uno.
 *
 * En operaciones masivas con muchas inserciones (por ejemplo, importación de
 * cuentas con decenas de abonos), pagar un viaje de red por cada renglón de
 * auditoría puede exceder el timeout de la transacción bajo latencia remota.
 */
export async function registrarAuditoriaEnLote(
  db: ClienteTransaccional,
  renglones: RenglonAuditoria[]
): Promise<void> {
  if (renglones.length === 0) return;
  await db.auditoria.createMany({ data: renglones.map(aFila) });
}

function aFila(params: RenglonAuditoria) {
  return {
    usuarioId: params.actorId,
    accion: params.accion,
    tablaAfectada: params.tablaAfectada,
    registroId: params.registroId,
    datosAnteriores: params.datosAnteriores,
    datosNuevos: params.datosNuevos,
    ipAddress: params.ipAddress,
    timestamp: new Date(),
  };
}
