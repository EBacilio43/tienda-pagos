import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { registrarAuditoria } from "@/server/audit/registrar";
import { puedeAjustarStock, ErrorPermiso } from "@/lib/permisos";
import { ErrorDominio } from "@/lib/errores";
import type { Rol } from "@/types/dominio";

export type ActorAuditoria = { id: number; rol: Rol };
type ClienteTransaccional = PrismaClient | Prisma.TransactionClient;

type ParamsAjuste = {
  idCatalogo: number;
  delta: number;
  tipo: string;
  referenciaTipo?: string;
  referenciaId?: number;
  notas?: string;
};

// AGENTS.md regla 4: único escritor de catalogo.stock. Toda variación
// inserta un movimiento_stock. Invariante: catalogo.stock ==
// SUM(movimientos_stock.delta) para cada artículo.
//
// Versión "Tx": corre dentro de una transacción que ya existe (ventas.ts,
// devoluciones.ts) para que el descuento/reversión de stock sea atómico
// con la venta/devolución misma — AGENTS.md regla 5 y el "Listo cuando" de
// Fase 4 lo exigen. `ajustarStock` (sin sufijo) es el atajo para llamadas
// sueltas (ajuste manual desde el catálogo) que abren su propia
// transacción.
export async function ajustarStockTx(
  tx: ClienteTransaccional,
  actor: ActorAuditoria,
  params: ParamsAjuste
): Promise<void> {
  // antes esto leía `stock`, sumaba el delta en memoria, y
  // escribía el resultado — un lost update bajo concurrencia (dos
  // transacciones leen el mismo valor viejo, ambas calculan y escriben, una
  // pisa a la otra). El UPDATE ahora aplica el delta en SQL (`increment`) y
  // valida "no queda negativo" en el propio WHERE — ambas cosas se evalúan
  // atómicamente bajo el lock de fila de Postgres, sin ventana entre leer y
  // escribir. `stock >= -delta` es la misma condición que `stock + delta >=
  // 0`, reescrita para no restar dentro del WHERE.
  const resultado = await tx.catalogo.updateMany({
    where: { id: params.idCatalogo, stock: { gte: -params.delta } },
    data: { stock: { increment: params.delta } },
  });

  if (resultado.count === 0) {
    const articulo = await tx.catalogo.findUnique({ where: { id: params.idCatalogo } });
    if (!articulo) {
      throw new ErrorDominio(`El artículo #${params.idCatalogo} no existe.`);
    }
    throw new ErrorDominio(
      `Stock insuficiente para "${articulo.nombre}" (actual: ${articulo.stock}, cambio: ${params.delta})`
    );
  }

  // Misma transacción: el valor recién escrito no puede cambiar antes de
  // que esta transacción termine (lock de fila ya en manos de esta tx) —
  // solo se usa para el detalle informativo de la auditoría.
  const articuloActualizado = await tx.catalogo.findUniqueOrThrow({
    where: { id: params.idCatalogo },
  });

  const movimiento = await tx.movimientoStock.create({
    data: {
      idCatalogo: params.idCatalogo,
      tipo: params.tipo,
      referenciaTipo: params.referenciaTipo,
      referenciaId: params.referenciaId,
      delta: params.delta,
      actorId: actor.id,
      notas: params.notas,
    },
  });

  await registrarAuditoria(tx, {
    actorId: actor.id,
    accion: "ajustar_stock",
    tablaAfectada: "catalogo",
    registroId: String(params.idCatalogo),
    datosNuevos: {
      delta: params.delta,
      tipo: params.tipo,
      movimientoId: movimiento.id,
      stockResultante: articuloActualizado.stock,
    },
  });
}

// Entrada pública para el ajuste manual desde catálogo — a diferencia de
// ajustarStockTx (helper interno que ventas.ts/devoluciones.ts reusan ya
// bajo su propio chequeo de puedeGestionarTransacciones), este sí valida
// el permiso específico de "ajustar stock".
export async function ajustarStock(
  actor: ActorAuditoria,
  params: ParamsAjuste
): Promise<void> {
  if (!puedeAjustarStock(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction((tx) => ajustarStockTx(tx, actor, params));
}
