"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/server/auth/guards";
import type { Rol } from "@/types/dominio";
import { esquemaVenta } from "@/lib/schemas/venta";
import { crearVenta, actualizarVenta, eliminarVenta } from "@/server/services/ventas";
import { mensajeDeError } from "@/server/actions/manejar-error";
import { assertRateLimitFinanciero, extraerIpDeHeaders } from "@/server/auth/rate-limiter";

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string };

// No hay forma limpia de mandar un array anidado por FormData nativo — el
// form serializa los artículos a JSON en un input oculto.
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
    esquemaPago: formData.get("esquemaPago"),
    frecuenciaPago: formData.get("frecuenciaPago") || undefined,
    tieneEnganche: formData.get("tieneEnganche") === "on",
    enganche: formData.get("enganche") || undefined,
    articulos: parsearArticulos(formData),
  };
}

export async function crearVentaAction(
  _prevState: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const tokenCrudo = formData.get("idempotencyToken");
  const token = typeof tokenCrudo === "string" && tokenCrudo.trim() ? tokenCrudo.trim() : undefined;

  const datos = esquemaVenta.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await crearVenta({ id: actor.id, rol: actor.rol as Rol }, datos.data, token);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "crearVenta", actorId: actor.id, idCliente: datos.data.idCliente }),
    };
  }

  revalidatePath(`/clientes/${datos.data.idCliente}`);
  revalidatePath("/inventario");
  revalidatePath("/catalogo");
  revalidatePath("/");
  redirect(`/clientes/${datos.data.idCliente}?tab=ventas`);
}

export async function actualizarVentaAction(
  id: number,
  _prevState: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const datos = esquemaVenta.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await actualizarVenta({ id: actor.id, rol: actor.rol as Rol }, id, datos.data);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "actualizarVenta", actorId: actor.id, ventaId: id }),
    };
  }

  revalidatePath(`/clientes/${datos.data.idCliente}`);
  revalidatePath("/inventario");
  revalidatePath("/catalogo");
  revalidatePath("/");
  redirect(`/clientes/${datos.data.idCliente}?tab=ventas`);
}

export async function eliminarVentaAction(
  id: number,
  idCliente: number
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await eliminarVenta({ id: actor.id, rol: actor.rol as Rol }, id);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "eliminarVenta", actorId: actor.id, ventaId: id }),
    };
  }

  revalidatePath(`/clientes/${idCliente}`);
  revalidatePath("/inventario");
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}
