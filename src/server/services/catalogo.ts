import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { decimalAString } from "@/lib/money";
import { registrarAuditoria } from "@/server/audit/registrar";
import { puedeGestionarCatalogo, ErrorPermiso } from "@/lib/permisos";
import { ErrorDominio } from "@/lib/errores";
import type { DatosArticulo } from "@/lib/schemas/articulo";
import type { CatalogoItemDTO, Rol } from "@/types/dominio";

export type { CatalogoItemDTO };
export type ActorAuditoria = { id: number; rol: Rol };

export async function listarCatalogo(): Promise<CatalogoItemDTO[]> {
  const items = await prisma.catalogo.findMany({ orderBy: { nombre: "asc" } });
  return items.map((i) => ({
    id: i.id,
    nombre: i.nombre,
    precio: decimalAString(i.precio ?? new Prisma.Decimal(0)),
    descripcion: i.descripcion,
    activo: i.activo ?? false,
    stock: i.stock,
    stockMinimo: i.stockMinimo,
  }));
}

// /inventario?filtro=bajo-minimo
export async function listarInventario(soloBajoMinimo: boolean): Promise<CatalogoItemDTO[]> {
  const items = await listarCatalogo();
  if (!soloBajoMinimo) return items;
  return items.filter((i) => i.stockMinimo > 0 && i.stock <= i.stockMinimo);
}

function datosParaAuditoria(datos: DatosArticulo) {
  return {
    nombre: datos.nombre,
    precio: datos.precio,
    descripcion: datos.descripcion ?? null,
    activo: datos.activo,
    stockMinimo: datos.stockMinimo,
  };
}

// Alta siempre con stock = 0 — ajustar stock es un flujo aparte
// (server/services/stock.ts), con su propio movimiento y auditoría.
export async function crearArticulo(
  actor: ActorAuditoria,
  datos: DatosArticulo
): Promise<{ id: number }> {
  if (!puedeGestionarCatalogo(actor.rol)) throw new ErrorPermiso();

  return prisma.$transaction(async (tx) => {
    const articulo = await tx.catalogo.create({
      data: {
        nombre: datos.nombre,
        precio: datos.precio,
        descripcion: datos.descripcion,
        activo: datos.activo,
        stockMinimo: datos.stockMinimo,
        stock: 0,
        fechaRegistro: new Date(),
      },
    });

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "crear",
      tablaAfectada: "catalogo",
      registroId: String(articulo.id),
      datosNuevos: datosParaAuditoria(datos),
    });

    return { id: articulo.id };
  });
}

export type CambioArticulo = DatosArticulo & { id: number };

// Grid editable en lote — guardado transaccional: todo o nada.
export async function guardarCatalogoEnLote(
  actor: ActorAuditoria,
  cambios: CambioArticulo[]
): Promise<void> {
  if (!puedeGestionarCatalogo(actor.rol)) throw new ErrorPermiso();
  if (cambios.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const cambio of cambios) {
      const anterior = await tx.catalogo.findUniqueOrThrow({ where: { id: cambio.id } });

      await tx.catalogo.update({
        where: { id: cambio.id },
        data: {
          nombre: cambio.nombre,
          precio: cambio.precio,
          descripcion: cambio.descripcion,
          activo: cambio.activo,
          stockMinimo: cambio.stockMinimo,
        },
      });

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "actualizar",
        tablaAfectada: "catalogo",
        registroId: String(cambio.id),
        datosAnteriores: {
          nombre: anterior.nombre,
          precio: anterior.precio ? decimalAString(anterior.precio) : null,
          descripcion: anterior.descripcion,
          activo: anterior.activo,
          stockMinimo: anterior.stockMinimo,
        },
        datosNuevos: datosParaAuditoria(cambio),
      });
    }
  });
}

export async function eliminarArticulo(actor: ActorAuditoria, id: number): Promise<void> {
  if (!puedeGestionarCatalogo(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction(async (tx) => {
    const articulo = await tx.catalogo.findUniqueOrThrow({ where: { id } });

    try {
      await tx.catalogo.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new ErrorDominio(
          `No se puede eliminar "${articulo.nombre}": tiene movimientos de stock o ventas asociadas.`
        );
      }
      throw err;
    }

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "eliminar",
      tablaAfectada: "catalogo",
      registroId: String(id),
      datosAnteriores: { nombre: articulo.nombre },
    });
  });
}
