"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/guards";
import { cerrarSesion } from "@/server/services/sesiones";
import { autenticar } from "@/server/auth/autenticar";
import { ipDelCliente } from "@/server/auth/ip-cliente";
import type { Rol } from "@/types/dominio";
import { mensajeDeError } from "@/server/actions/manejar-error";

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string };
export type EstadoLogin = { mensaje?: string };

const esquemaLogin = z.object({
  username: z.string().min(1, "Ingresa tu usuario").max(50),
  password: z.string().min(1, "Ingresa tu contraseña").max(200),
});

export async function loginAction(
  _prevState: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const datos = esquemaLogin.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!datos.success) {
    return { mensaje: "Credenciales incorrectas" };
  }

  const headersList = await headers();
  const ipAddress = ipDelCliente(headersList);
  const userAgent = headersList.get("user-agent");

  const resultado = await autenticar(datos.data.username, datos.data.password, {
    ipAddress,
    userAgent,
  });

  if (!resultado.exitoso) {
    return { mensaje: resultado.mensaje };
  }

  redirect("/");
}

export async function cerrarSesionAction(sesionId: number): Promise<ResultadoAccion> {
  const actor = await requireUser();

  try {
    await cerrarSesion({ id: actor.id, rol: actor.rol as Rol }, sesionId);
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "cerrarSesion", actorId: actor.id, sesionId }),
    };
  }

  revalidatePath("/admin/sesiones");
  return { ok: true };
}
