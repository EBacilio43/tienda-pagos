import "server-only";
import { prisma } from "@/server/db/prisma";
import { verificarPassword } from "./password";
import {
  estaBloqueado,
  registrarIntentoFallido,
  registrarLoginExitoso,
} from "./lockout";
import { ipBloqueada, MINUTOS_VENTANA_IP } from "./rate-limit-ip";
import { crearSesion } from "./session";

export type ResultadoLogin =
  | { exitoso: true }
  | { exitoso: false; mensaje: string };

type MetaLogin = { ipAddress?: string | null; userAgent?: string | null };

async function registrarIntentoLog(
  usuarioId: number | null,
  usernameIntentado: string,
  exitoso: boolean,
  motivoFalla: string | null,
  meta: MetaLogin
): Promise<void> {
  await prisma.sesionLog.create({
    data: {
      usuarioId,
      usernameIntentado,
      exitoso,
      motivoFalla,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      timestamp: new Date(),
    },
  });
}

// Hash de descarte generado con bcrypt rounds=12 para mitigar timing attacks
// de enumeración de usuarios. Hace que el tiempo de respuesta cuando el
// usuario no existe sea idéntico al de un usuario existente.
const HASH_DESCARTE = "$2y$12$dDT1Znwgpe/4TTz53FQYKunD2TWJLrb0e0abp/c9qwQTX2QeCi.vq";
const MENSAJE_CREDENCIALES_INCORRECTAS = "Credenciales incorrectas";

// Autenticacion con bcrypt, mitigacion de timing attacks y bloqueo progresivo.
export async function autenticar(
  username: string,
  password: string,
  meta: MetaLogin
): Promise<ResultadoLogin> {
  if (await ipBloqueada(meta.ipAddress ?? null)) {
    await registrarIntentoLog(null, username, false, "ip_bloqueada", meta);
    return {
      exitoso: false,
      mensaje: `Demasiados intentos desde esta red. Intente en ${MINUTOS_VENTANA_IP} minutos.`,
    };
  }

  const usuario = await prisma.usuario.findUnique({ where: { username } });

  if (!usuario) {
    await verificarPassword(password, HASH_DESCARTE);
    await registrarIntentoLog(null, username, false, "usuario_no_existe", meta);
    return { exitoso: false, mensaje: MENSAJE_CREDENCIALES_INCORRECTAS };
  }

  if (!usuario.activo) {
    await verificarPassword(password, usuario.passwordHash);
    await registrarIntentoLog(usuario.id, username, false, "usuario_inactivo", meta);
    return {
      exitoso: false,
      mensaje: MENSAJE_CREDENCIALES_INCORRECTAS,
    };
  }

  if (estaBloqueado(usuario)) {
    await verificarPassword(password, usuario.passwordHash);
    await registrarIntentoLog(usuario.id, username, false, "bloqueado", meta);
    return {
      exitoso: false,
      mensaje: MENSAJE_CREDENCIALES_INCORRECTAS,
    };
  }

  const passwordValido = await verificarPassword(password, usuario.passwordHash);
  if (!passwordValido) {
    await registrarIntentoFallido(usuario);
    await registrarIntentoLog(usuario.id, username, false, "password_incorrecto", meta);
    return { exitoso: false, mensaje: MENSAJE_CREDENCIALES_INCORRECTAS };
  }

  await registrarLoginExitoso(usuario.id);
  await registrarIntentoLog(usuario.id, username, true, null, meta);
  await prisma.auditoria.create({
    data: {
      usuarioId: usuario.id,
      accion: "login",
      tablaAfectada: "usuarios",
      registroId: String(usuario.id),
      ipAddress: meta.ipAddress,
      timestamp: new Date(),
    },
  });
  await crearSesion(usuario.id, meta);

  return { exitoso: true };
}
