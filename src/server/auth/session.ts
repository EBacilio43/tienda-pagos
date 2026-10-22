import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, createHmac } from "node:crypto";
import type { Usuario } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  DURACION_ABSOLUTA_HORAS,
  TIMEOUT_INACTIVIDAD_HORAS,
} from "@/lib/sesion";

// ADR-15: sesiones opacas propias, no Auth.js — Auth.js v5 fuerza JWT y JWT
// no se puede revocar antes de expirar. Aquí cada request valida contra la
// BD, así desactivar un usuario le corta la sesión al instante.
export const COOKIE_NAME = "sesion";

// Fase 7: HMAC con SESSION_SECRET como pepper, no un hash plano — así
// tener acceso de lectura a `sesiones.token_hash` (un dump, un backup)
// no alcanza para derivar ni validar tokens sin conocer también el
// secreto. `instrumentation.ts` ya garantiza que SESSION_SECRET existe
// antes de que el server acepte requests.
export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET || "dummy-test-secret-no-produccion";
  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function crearSesion(
  usuarioId: number,
  meta: { ipAddress?: string | null; userAgent?: string | null }
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + DURACION_ABSOLUTA_HORAS * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // P17: Política de sesión única activa (Single Active Session).
    // Antes de insertar la nueva sesión, se revocan las sesiones previas
    // del usuario y se deja constancia en sesiones_log y auditoría.
    const sesionesPrevias = await tx.sesion.findMany({
      where: { usuarioId },
      include: { usuario: { select: { username: true } } },
    });

    if (sesionesPrevias.length > 0) {
      await tx.sesionLog.createMany({
        data: sesionesPrevias.map((s) => ({
          usuarioId: s.usuarioId,
          usernameIntentado: s.usuario.username,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          exitoso: false,
          motivoFalla: "sesion_reemplazada",
          timestamp: new Date(),
        })),
      });

      for (const s of sesionesPrevias) {
        await tx.auditoria.create({
          data: {
            usuarioId,
            accion: "sesion_reemplazada",
            tablaAfectada: "sesiones",
            registroId: String(s.id),
            datosAnteriores: {
              ipAddress: s.ipAddress,
              userAgent: s.userAgent,
              creadaEn: s.creadaEn.toISOString(),
            },
            ipAddress: meta.ipAddress,
            timestamp: new Date(),
          },
        });
      }

      await tx.sesion.deleteMany({
        where: { usuarioId },
      });
    }

    await tx.sesion.create({
      data: {
        usuarioId,
        tokenHash: hashToken(token),
        expiraEn,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  });

  try {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiraEn,
      path: "/",
    });
  } catch {
    // Fuera de contexto HTTP de Next.js (ej. tests directos)
  }

  return token;
}

/**
 * Una sola consulta por request (React.cache). Además de validar expiración
 * absoluta e inactividad, revisa `usuario.activo` en vivo — así un admin
 * desactivando a alguien en /admin/usuarios le corta el acceso en el
 * siguiente request, no cuando expire el token.
 */
export const leerSesion = cache(async (): Promise<Usuario | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const sesion = await prisma.sesion.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: true },
  });
  if (!sesion) return null;

  const ahora = Date.now();
  const inactivaMs = ahora - sesion.ultimaActividad.getTime();
  const expirada =
    sesion.expiraEn.getTime() < ahora ||
    inactivaMs > TIMEOUT_INACTIVIDAD_HORAS * 60 * 60 * 1000 ||
    !sesion.usuario.activo;

  if (expirada) {
    await prisma.sesion.delete({ where: { id: sesion.id } }).catch(() => {});
    return null;
  }

  await prisma.sesion.update({
    where: { id: sesion.id },
    data: { ultimaActividad: new Date(ahora) },
  });

  return sesion.usuario;
});

/**
 * El `tokenHash` de la sesión que está haciendo este request, o `null` si no
 * hay cookie. Existe para que un cambio de contraseña pueda borrar TODAS las
 * demás sesiones del usuario sin cerrar la que está usando en ese momento —
 * el hash no puede calcularse fuera de aquí, que es donde vive el pepper.
 */
export async function tokenHashDeLaSesionActual(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? hashToken(token) : null;
}

export async function destruirSesionActual(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.sesion.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(COOKIE_NAME);
}
