"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/server/auth/guards";
import type { Rol } from "@/types/dominio";
import { esquemaPago, esquemaPagosLote, type DatosPago } from "@/lib/schemas/pago";
import {
  crearPago,
  actualizarPago,
  eliminarPago,
  crearPagosEnLote,
  buscarPagosDuplicados,
} from "@/server/services/pagos";
import { mensajeDeError } from "@/server/actions/manejar-error";
import { assertRateLimitFinanciero, extraerIpDeHeaders } from "@/server/auth/rate-limiter";

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string };

function datosDelFormulario(formData: FormData) {
  return {
    idCliente: formData.get("idCliente"),
    fecha: formData.get("fecha"),
    monto: formData.get("monto"),
    metodoPago: formData.get("metodoPago"),
    referencia: formData.get("referencia"),
    notas: formData.get("notas"),
  };
}

export async function crearPagoAction(
  _prevState: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const tokenCrudo = formData.get("idempotencyToken");
  const token = typeof tokenCrudo === "string" && tokenCrudo.trim() ? tokenCrudo.trim() : undefined;

  const datos = esquemaPago.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await crearPago({ id: actor.id, rol: actor.rol as Rol }, datos.data, token);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "crearPago", actorId: actor.id, idCliente: datos.data.idCliente }),
    };
  }

  revalidatePath(`/clientes/${datos.data.idCliente}`);
  revalidatePath("/");
  redirect(`/clientes/${datos.data.idCliente}?tab=pagos`);
}

export type FilaLote = {
  idCliente: number;
  fecha: string;
  monto: string;
  metodoPago?: string;
  referencia?: string;
};

// Consulta previa al guardado: marca qué renglones ya existen tal cual en
// la base. Solo lectura y sin efectos — la decisión de guardar de todos
// modos es del operador (ver claveDuplicado en el servicio).
export async function revisarDuplicadosAction(filas: FilaLote[]): Promise<string[]> {
  await requireUser();
  const existentes = await buscarPagosDuplicados(
    filas.map((f) => ({ idCliente: f.idCliente, fecha: f.fecha, monto: f.monto }))
  );
  return [...existentes];
}

export type ResultadoLote =
  | { ok: true; registrados: number }
  | { ok: false; mensaje: string; fila?: number };

export async function crearPagosEnLoteAction(
  filas: FilaLote[],
  token?: string
): Promise<ResultadoLote> {
  const actor = await requireUser();

  // Se valida renglón por renglón para poder decir CUÁL falló: en una
  // captura de 20 abonos, "datos inválidos" a secas obliga a revisarlos
  // todos a mano.
  const validadas: DatosPago[] = [];
  for (const [indice, fila] of filas.entries()) {
    const datos = esquemaPago.safeParse(fila);
    if (!datos.success) {
      return {
        ok: false,
        fila: indice,
        mensaje: `Renglón ${indice + 1}: ${datos.error.issues[0]?.message ?? "datos inválidos"}`,
      };
    }
    validadas.push(datos.data);
  }

  const lote = esquemaPagosLote.safeParse(validadas);
  if (!lote.success) {
    return { ok: false, mensaje: lote.error.issues[0]?.message ?? "Lote inválido" };
  }

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    const { ids } = await crearPagosEnLote(
      { id: actor.id, rol: actor.rol as Rol },
      lote.data,
      token
    );
    for (const idCliente of new Set(lote.data.map((f) => f.idCliente))) {
      revalidatePath(`/clientes/${idCliente}`);
    }
    revalidatePath("/");
    revalidatePath("/clientes");
    revalidatePath("/actividad");
    return { ok: true, registrados: ids.length };
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "crearPagosEnLote", actorId: actor.id, filas: filas.length }),
    };
  }
}

export async function actualizarPagoAction(
  id: number,
  _prevState: unknown,
  formData: FormData
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const datos = esquemaPago.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await actualizarPago({ id: actor.id, rol: actor.rol as Rol }, id, datos.data);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "actualizarPago", actorId: actor.id, pagoId: id }),
    };
  }

  revalidatePath(`/clientes/${datos.data.idCliente}`);
  revalidatePath("/");
  redirect(`/clientes/${datos.data.idCliente}?tab=pagos`);
}

export async function eliminarPagoAction(
  id: number,
  idCliente: number
): Promise<ResultadoAccion> {
  const actor = await requireUser();

  const headersList = await headers();
  const ip = extraerIpDeHeaders(headersList);

  try {
    assertRateLimitFinanciero(actor.id, ip);
    await eliminarPago({ id: actor.id, rol: actor.rol as Rol }, id);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "eliminarPago", actorId: actor.id, pagoId: id }),
    };
  }

  revalidatePath(`/clientes/${idCliente}`);
  revalidatePath("/");
  return { ok: true };
}
