"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import {
  esquemaUsuario,
  esquemaEditarUsuario,
  esquemaResetPassword,
  esquemaCambiarPasswordPropia,
} from "@/lib/schemas/usuario";
import {
  crearUsuario,
  actualizarUsuario,
  resetearPassword,
  cambiarPasswordPropia,
} from "@/server/services/usuarios";
import type { Rol } from "@/types/dominio";
import { mensajeDeError } from "@/server/actions/manejar-error";

export type EstadoFormularioUsuario = {
  mensaje?: string;
  exito?: boolean;
  errores?: Record<string, string[] | undefined>;
};

export async function crearUsuarioAction(
  _prevState: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const actor = await requireUser();

  const datos = esquemaUsuario.safeParse({
    username: formData.get("username"),
    nombreCompleto: formData.get("nombreCompleto"),
    email: formData.get("email") ?? undefined,
    rol: formData.get("rol"),
    password: formData.get("password"),
  });
  if (!datos.success) {
    return { errores: datos.error.flatten().fieldErrors };
  }

  try {
    await crearUsuario({ id: actor.id, rol: actor.rol as Rol }, datos.data);
  } catch (err) {
    return { mensaje: mensajeDeError(err, { accion: "crearUsuario", actorId: actor.id }) };
  }

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function actualizarUsuarioAction(
  id: number,
  _prevState: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const actor = await requireUser();

  const datos = esquemaEditarUsuario.safeParse({
    nombreCompleto: formData.get("nombreCompleto"),
    email: formData.get("email") ?? undefined,
    rol: formData.get("rol"),
    activo: formData.get("activo") === "on",
  });
  if (!datos.success) {
    return { errores: datos.error.flatten().fieldErrors };
  }

  try {
    await actualizarUsuario({ id: actor.id, rol: actor.rol as Rol }, id, datos.data);
  } catch (err) {
    return { mensaje: mensajeDeError(err, { accion: "actualizarUsuario", actorId: actor.id, usuarioId: id }) };
  }

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function resetearPasswordAction(
  id: number,
  _prevState: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const actor = await requireUser();

  const datos = esquemaResetPassword.safeParse({
    password: formData.get("password"),
    confirmar: formData.get("confirmar"),
  });
  if (!datos.success) {
    return { errores: datos.error.flatten().fieldErrors };
  }

  try {
    await resetearPassword({ id: actor.id, rol: actor.rol as Rol }, id, datos.data);
  } catch (err) {
    return { mensaje: mensajeDeError(err, { accion: "resetearPassword", actorId: actor.id, usuarioId: id }) };
  }

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function cambiarPasswordPropiaAction(
  _prevState: EstadoFormularioUsuario,
  formData: FormData
): Promise<EstadoFormularioUsuario> {
  const actor = await requireUser();

  const datos = esquemaCambiarPasswordPropia.safeParse({
    passwordActual: formData.get("passwordActual"),
    passwordNueva: formData.get("passwordNueva"),
    confirmar: formData.get("confirmar"),
  });
  if (!datos.success) {
    return { errores: datos.error.flatten().fieldErrors };
  }

  try {
    await cambiarPasswordPropia(actor.id, datos.data.passwordActual, datos.data.passwordNueva);
  } catch (err) {
    return { mensaje: mensajeDeError(err, { accion: "cambiarPasswordPropia", actorId: actor.id }) };
  }

  return { exito: true, mensaje: "Contraseña actualizada." };
}
