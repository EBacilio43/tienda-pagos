"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/guards";
import type { Rol } from "@/types/dominio";
import { esquemaArticulo, esquemaAjusteStock } from "@/lib/schemas/articulo";
import {
  crearArticulo,
  guardarCatalogoEnLote,
  eliminarArticulo,
  type CambioArticulo,
} from "@/server/services/catalogo";
import { ajustarStock } from "@/server/services/stock";
import { mensajeDeError } from "@/server/actions/manejar-error";

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string };

export async function crearArticuloAction(
  _prevState: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const datos = esquemaArticulo.safeParse({
    nombre: formData.get("nombre"),
    precio: formData.get("precio"),
    descripcion: formData.get("descripcion") ?? undefined,
    activo: formData.get("activo") === "on",
    stockMinimo: formData.get("stockMinimo"),
  });
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await crearArticulo({ id: actor.id, rol: actor.rol as Rol }, datos.data);
  } catch (err) {
    return { ok: false, mensaje: mensajeDeError(err, { accion: "crearArticulo", actorId: actor.id }) };
  }

  revalidatePath("/catalogo");
  revalidatePath("/inventario");
  return { ok: true };
}

export async function guardarCatalogoEnLoteAction(
  cambios: CambioArticulo[]
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const validados: CambioArticulo[] = [];
  for (const cambio of cambios) {
    const datos = esquemaArticulo.safeParse(cambio);
    if (!datos.success) {
      return {
        ok: false,
        mensaje: `Artículo #${cambio.id}: ${datos.error.issues[0]?.message ?? "datos inválidos"}`,
      };
    }
    validados.push({ ...datos.data, id: cambio.id });
  }

  try {
    await guardarCatalogoEnLote({ id: actor.id, rol: actor.rol as Rol }, validados);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "guardarCatalogoEnLote", actorId: actor.id }),
    };
  }

  revalidatePath("/catalogo");
  revalidatePath("/inventario");
  return { ok: true };
}

export async function eliminarArticuloAction(id: number): Promise<ResultadoAccion> {
  const actor = await requireUser();

  try {
    await eliminarArticulo({ id: actor.id, rol: actor.rol as Rol }, id);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "eliminarArticulo", actorId: actor.id, articuloId: id }),
    };
  }

  revalidatePath("/catalogo");
  revalidatePath("/inventario");
  return { ok: true };
}

export async function ajustarStockAction(
  idCatalogo: number,
  delta: number,
  notas: string
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const datos = esquemaAjusteStock.safeParse({ idCatalogo, delta, notas });
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await ajustarStock(
      { id: actor.id, rol: actor.rol as Rol },
      {
        idCatalogo: datos.data.idCatalogo,
        delta: datos.data.delta,
        tipo: "ajuste_manual",
        notas: datos.data.notas,
      }
    );
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, {
        accion: "ajustarStock",
        actorId: actor.id,
        idCatalogo: datos.data.idCatalogo,
      }),
    };
  }

  revalidatePath("/catalogo");
  revalidatePath("/inventario");
  revalidatePath("/");
  return { ok: true };
}
