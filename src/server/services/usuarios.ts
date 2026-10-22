import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { registrarAuditoria } from "@/server/audit/registrar";
import { hashearPassword, verificarPassword } from "@/server/auth/password";
import {
  estaBloqueado,
  registrarIntentoFallido,
  MAX_INTENTOS_FALLIDOS,
  MINUTOS_BLOQUEO,
} from "@/server/auth/lockout";
import { tokenHashDeLaSesionActual } from "@/server/auth/session";
import { puedeGestionarUsuarios, ErrorPermiso } from "@/lib/permisos";
import { ErrorDominio } from "@/lib/errores";
import { fechaHoraAString, tiempoRelativo } from "@/lib/fecha";
import { limiteDeInactividad } from "@/lib/sesion";
import type {
  DatosUsuario,
  DatosEditarUsuario,
  DatosResetPassword,
} from "@/lib/schemas/usuario";
import type { EstadoUsuario, Rol, UsuarioListaDTO } from "@/types/dominio";

export type ActorAuditoria = { id: number; rol: Rol };

/**
 * El conteo de sesiones vivas por usuario, en UNA consulta para toda la
 * lista — no una por tarjeta. Los tres criterios son los mismos que aplica
 * `listarSesionesActivas` (services/sesiones.ts) y, antes que ella,
 * `leerSesion()` en cada request: si aquí se relajaran, la tarjeta diría
 * "en línea" de alguien a quien la autenticación ya está rechazando.
 *
 * El filtro por `usuario.activo` no se repite aquí porque el llamador ya
 * conoce ese campo y lo aplica al derivar el estado — una cuenta
 * desactivada se lee "Desactivada", nunca "En línea".
 */
async function contarSesionesVivasPorUsuario(): Promise<Map<number, number>> {
  const ahora = new Date();
  const grupos = await prisma.sesion.groupBy({
    by: ["usuarioId"],
    where: {
      expiraEn: { gt: ahora },
      ultimaActividad: { gt: limiteDeInactividad(ahora) },
    },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.usuarioId, g._count._all]));
}

export async function listarUsuarios(): Promise<UsuarioListaDTO[]> {
  const ahora = new Date();
  const [usuarios, sesionesPorUsuario] = await Promise.all([
    prisma.usuario.findMany({ orderBy: { nombreCompleto: "asc" } }),
    contarSesionesVivasPorUsuario(),
  ]);

  return usuarios.map((u) => {
    const sesionesActivas = u.activo ? (sesionesPorUsuario.get(u.id) ?? 0) : 0;
    const bloqueado = u.bloqueadoHasta !== null && u.bloqueadoHasta > ahora;

    const estado: EstadoUsuario = !u.activo
      ? "desactivado"
      : bloqueado
        ? "bloqueado"
        : sesionesActivas > 0
          ? "en_linea"
          : "activo";

    return {
      id: u.id,
      username: u.username,
      nombreCompleto: u.nombreCompleto,
      email: u.email,
      rol: u.rol,
      estado,
      sesionesActivas,
      ultimoLogin: u.ultimoLogin ? fechaHoraAString(u.ultimoLogin) : null,
      ultimoLoginRelativo: u.ultimoLogin ? tiempoRelativo(u.ultimoLogin, ahora) : null,
      ultimaActividad: u.ultimaActividad ? fechaHoraAString(u.ultimaActividad) : null,
      ultimaActividadRelativa: u.ultimaActividad ? tiempoRelativo(u.ultimaActividad, ahora) : null,
      // Solo si sigue vigente: un bloqueo que ya venció es ruido histórico,
      // no información sobre la cuenta hoy.
      bloqueadoHasta: bloqueado ? fechaHoraAString(u.bloqueadoHasta!) : null,
      intentosFallidos: u.intentosFallidos,
      creadoEn: u.creadoEn ? fechaHoraAString(u.creadoEn) : null,
    };
  });
}

export type UsuarioDetalleDTO = {
  id: number;
  username: string;
  nombreCompleto: string;
  email: string | null;
  rol: string;
  activo: boolean;
  ultimoLogin: string | null;
  creadoEn: string | null;
};

export async function obtenerUsuarioParaEditar(id: number): Promise<UsuarioDetalleDTO | null> {
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    nombreCompleto: u.nombreCompleto,
    email: u.email,
    rol: u.rol,
    activo: u.activo,
    ultimoLogin: u.ultimoLogin ? fechaHoraAString(u.ultimoLogin) : null,
    creadoEn: u.creadoEn ? fechaHoraAString(u.creadoEn) : null,
  };
}

function errorDuplicado(err: unknown, username: string, email?: string): never | void {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const campo = Array.isArray(err.meta?.target) ? err.meta.target.join(",") : "";
    if (campo.includes("email")) {
      throw new ErrorDominio(`Ya existe un usuario con el email "${email}"`);
    }
    throw new ErrorDominio(`Ya existe un usuario con el username "${username}"`);
  }
  throw err;
}

// Reemplaza scripts/crear_usuario.py del repo viejo (uso interactivo por
// CLI) — mismas cuatro operaciones (crear/listar/desactivar/reset-password)
// ahora en la UI, con permiso real aplicado en el servicio.
export async function crearUsuario(
  actor: ActorAuditoria,
  datos: DatosUsuario
): Promise<{ id: number }> {
  if (!puedeGestionarUsuarios(actor.rol)) throw new ErrorPermiso();

  const passwordHash = await hashearPassword(datos.password);

  try {
    return await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          username: datos.username,
          nombreCompleto: datos.nombreCompleto,
          email: datos.email,
          rol: datos.rol,
          passwordHash,
          activo: true,
          intentosFallidos: 0,
          creadoEn: new Date(),
        },
      });

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "crear",
        tablaAfectada: "usuarios",
        registroId: String(usuario.id),
        datosNuevos: {
          username: datos.username,
          nombreCompleto: datos.nombreCompleto,
          email: datos.email ?? null,
          rol: datos.rol,
        },
      });

      return { id: usuario.id };
    });
  } catch (err) {
    errorDuplicado(err, datos.username, datos.email);
    throw err;
  }
}

// Editar el propio usuario por esta vía queda bloqueado a propósito — un
// admin no debe poder desactivarse o quitarse el rol a sí mismo por
// accidente y quedar sin forma de revertirlo. Para eso está /mi-cuenta.
export async function actualizarUsuario(
  actor: ActorAuditoria,
  id: number,
  datos: DatosEditarUsuario
): Promise<void> {
  if (!puedeGestionarUsuarios(actor.rol)) throw new ErrorPermiso();
  if (actor.id === id) {
    throw new ErrorDominio("No puedes editar tu propio usuario aquí — usa \"Mi cuenta\".");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const anterior = await tx.usuario.findUniqueOrThrow({ where: { id } });

      await tx.usuario.update({
        where: { id },
        data: {
          nombreCompleto: datos.nombreCompleto,
          email: datos.email,
          rol: datos.rol,
          activo: datos.activo,
          actualizadoEn: new Date(),
        },
      });

      // Desactivar mata las sesiones al instante, no en el próximo request
      // (leerSesion() ya las cortaría de todos modos, pero esto lo hace
      // real de inmediato, no perezoso).
      if (anterior.activo && !datos.activo) {
        await tx.sesion.deleteMany({ where: { usuarioId: id } });
      }

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "actualizar",
        tablaAfectada: "usuarios",
        registroId: String(id),
        datosAnteriores: {
          nombreCompleto: anterior.nombreCompleto,
          email: anterior.email,
          rol: anterior.rol,
          activo: anterior.activo,
        },
        datosNuevos: {
          nombreCompleto: datos.nombreCompleto,
          email: datos.email ?? null,
          rol: datos.rol,
          activo: datos.activo,
        },
      });
    });
  } catch (err) {
    // username no es editable aquí, así que un P2002 solo puede venir del
    // email — el ternario del helper cubre ambos casos igual.
    errorDuplicado(err, "", datos.email);
    throw err;
  }
}

export async function resetearPassword(
  actor: ActorAuditoria,
  id: number,
  datos: DatosResetPassword
): Promise<void> {
  if (!puedeGestionarUsuarios(actor.rol)) throw new ErrorPermiso();
  if (actor.id === id) {
    throw new ErrorDominio("No puedes resetear tu propia contraseña aquí — usa \"Mi cuenta\".");
  }

  const passwordHash = await hashearPassword(datos.password);

  await prisma.$transaction(async (tx) => {
    await tx.usuario.findUniqueOrThrow({ where: { id } });

    await tx.usuario.update({
      where: { id },
      data: {
        passwordHash,
        intentosFallidos: 0,
        bloqueadoHasta: null,
        actualizadoEn: new Date(),
      },
    });

    // Cambiar la contraseña sin cerrar las sesiones abiertas no sirve de
    // nada como respuesta a un incidente: la sesión es una credencial
    // independiente de la contraseña, así que quien ya estaba dentro seguía
    // dentro hasta 24 h más (el tope absoluto de `lib/sesion.ts`). Y el
    // reset de un admin es justo la acción que se toma cuando se sospecha
    // que una cuenta está comprometida. `actualizarUsuario` ya hacía esto al
    // desactivar a alguien; faltaba aquí.
    //
    // Se borran TODAS, incluida la del propio afectado si está conectado:
    // resetearse la contraseña a uno mismo por esta vía está prohibido más
    // arriba, así que nunca es la sesión de quien ejecuta la acción.
    await tx.sesion.deleteMany({ where: { usuarioId: id } });

    // Nunca se audita la contraseña en sí, solo que ocurrió el reset.
    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "resetear_password",
      tablaAfectada: "usuarios",
      registroId: String(id),
    });
  });
}

export async function cambiarPasswordPropia(
  actorId: number,
  passwordActual: string,
  passwordNueva: string
): Promise<void> {
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: actorId } });

  if (estaBloqueado(usuario)) {
    const minutosRestantes = Math.ceil(
      (usuario.bloqueadoHasta!.getTime() - Date.now()) / 60_000
    );
    throw new ErrorDominio(
      `Usuario bloqueado por demasiados intentos. Intente en ${minutosRestantes} minutos.`
    );
  }

  const valido = await verificarPassword(passwordActual, usuario.passwordHash);
  if (!valido) {
    const intento = await registrarIntentoFallido(usuario);
    if (intento.bloqueado) {
      throw new ErrorDominio(
        `Demasiados intentos fallidos. Usuario bloqueado por ${MINUTOS_BLOQUEO} minutos.`
      );
    }
    throw new ErrorDominio(
      `La contraseña actual es incorrecta. Intentos restantes: ${MAX_INTENTOS_FALLIDOS - intento.intentosFallidos}.`
    );
  }

  const passwordHash = await hashearPassword(passwordNueva);
  const sesionEnCurso = await tokenHashDeLaSesionActual();

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: actorId },
      data: {
        passwordHash,
        intentosFallidos: 0,
        bloqueadoHasta: null,
        actualizadoEn: new Date(),
      },
    });

    // Mismo motivo que en `resetearPassword`, con una diferencia: aquí quien
    // cambia la contraseña es quien está usando la app, así que su propia
    // sesión se preserva y solo mueren las demás. Cerrarlas todas lo
    // expulsaría a él —el único que no debería salir— y el gesto de "cambio
    // mi contraseña porque creo que alguien entró" dejaría dentro justo a
    // quien se quería sacar.
    await tx.sesion.deleteMany({
      where: {
        usuarioId: actorId,
        ...(sesionEnCurso ? { tokenHash: { not: sesionEnCurso } } : {}),
      },
    });

    await registrarAuditoria(tx, {
      actorId,
      accion: "cambiar_password",
      tablaAfectada: "usuarios",
      registroId: String(actorId),
    });
  });
}

export const cambiarContrasena = cambiarPasswordPropia;
