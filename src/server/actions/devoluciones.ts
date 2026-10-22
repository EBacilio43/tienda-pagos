"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/server/auth/guards";
import type { Rol } from "@/types/dominio";
import { esquemaDevolucion } from "@/lib/schemas/devolucion";
import {
  crearDevolucion,
  actualizarDevolucion,
  eliminarDevolucion,
} from "@/server/services/devoluciones";
import { mensajeDeError } from "@/server/actions/manejar-error";
import { assertRateLimitFinanciero, extraerIpDeHeaders } from "@/server/auth/rate-limiter";

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string };

function parsearArticulos(formData: FormData): unknown {
  const crudo = formData.get("articulosJson");
  if (typeof crudo !== "string") return [];
  try {
    return JSON.parse(crudo);
  } catch {
    return [];
  }
}

function datosDelFormulario(formData: FormData) {
  return {
    idCliente: formData.get("idCliente"),
    fecha: formData.get("fecha"),
    motivo: formData.get("motivo"),
    articulos: parsearArticulos(formData),
  };
}

export async function crearDevolucionAction(
  _prevState: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const tokenCrudo = formData.get("idempotencyToken");
  const token = typeof tokenCrudo === "string" && tokenCrudo.trim() ? tokenCrudo.trim() : undefined;

  const datos = esquemaDevolucion.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await crearDevolucion({ id: actor.id, rol: actor.rol as Rol }, datos.data, token);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, {
        accion: "crearDevolucion",
        actorId: actor.id,
        idCliente: datos.data.idCliente,
      }),
    };
  }

  revalidatePath(`/clientes/${datos.data.idCliente}`);
  revalidatePath("/inventario");
  revalidatePath("/catalogo");
  revalidatePath("/");
  redirect(`/clientes/${datos.data.idCliente}?tab=devoluciones`);
}

export async function actualizarDevolucionAction(
  id: number,
  _prevState: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const datos = esquemaDevolucion.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await actualizarDevolucion({ id: actor.id, rol: actor.rol as Rol }, id, datos.data);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "actualizarDevolucion", actorId: actor.id, devolucionId: id }),
    };
  }

  revalidatePath(`/clientes/${datos.data.idCliente}`);
  revalidatePath("/inventario");
  revalidatePath("/catalogo");
  revalidatePath("/");
  redirect(`/clientes/${datos.data.idCliente}?tab=devoluciones`);
}

export async function eliminarDevolucionAction(
  id: number,
  idCliente: number
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await eliminarDevolucion({ id: actor.id, rol: actor.rol as Rol }, id);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "eliminarDevolucion", actorId: actor.id, devolucionId: id }),
    };
  }

  revalidatePath(`/clientes/${idCliente}`);
  revalidatePath("/inventario");
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
