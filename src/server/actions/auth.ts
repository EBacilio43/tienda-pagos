"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { autenticar } from "@/server/auth/autenticar";
import { assertRateLimitLogin } from "@/server/auth/rate-limiter";
import { ipDelCliente } from "@/server/auth/ip-cliente";
import { ErrorDominio } from "@/lib/errores";

const esquemaLogin = z.object({
  username: z.string().trim().min(1, "Ingresa tu usuario").max(50, "Máximo 50 caracteres"),
  password: z.string().min(1, "Ingresa tu contraseña").max(128, "Máximo 128 caracteres"),
});

export type EstadoLogin = { mensaje?: string };

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

  // P13: Freno de fuerza bruta por IP (5 intentos / minuto)
  const yaVerificado = headersList.get("x-ratelimit-login-checked") === "1";
  if (!yaVerificado) {
    try {
      assertRateLimitLogin(ipAddress ?? "127.0.0.1");
    } catch (err) {
      if (err instanceof ErrorDominio) {
        return { mensaje: err.message };
      }
      throw err;
    }
  }

  const resultado = await autenticar(datos.data.username, datos.data.password, {
    ipAddress,
    userAgent,
  });

  if (!resultado.exitoso) {
    return { mensaje: resultado.mensaje };
  }

  redirect("/");
}
