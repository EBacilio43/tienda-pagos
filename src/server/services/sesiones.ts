import { prisma } from "@/server/db/prisma";
import { registrarAuditoria } from "@/server/audit/registrar";
import { puedeGestionarUsuarios, ErrorPermiso } from "@/lib/permisos";
import { fechaHoraAString } from "@/lib/fecha";
import type { Rol } from "@/types/dominio";
import { limiteDeInactividad } from "@/lib/sesion";

export type ActorAuditoria = { id: number; rol: Rol };

export type SesionActivaDTO = {
  id: number;
  usuarioId: number;
  usuarioNombre: string;
  username: string;
  ipAddress: string | null;
  userAgent: string | null;
  creadaEn: string;
  ultimaActividad: string;
  expiraEn: string;
};

/**
 * Solo las que de verdad pueden autenticar. Los tres criterios son los
 * MISMOS que aplica `leerSesion()` en cada request, tomados de la misma
 * fuente (`lib/sesion.ts`) para que no puedan separarse.
 *
 * Antes esto era un `findMany` sin `where`: devolvía la tabla entera. Una
 * sesión expirada solo se borra cuando alguien vuelve a presentar su
 * cookie, y lo normal es que nadie vuelva —se cierra la pestaña y ya—, así
 * que las filas muertas se quedaban para siempre y la pantalla las listaba
 * como activas. Medido en la base de desarrollo el 2026-09-03: 34 de 35
 * filas estaban expiradas, algunas de tres semanas antes.
 *
 * No es que dieran acceso —`leerSesion()` las rechaza, son inertes— sino
 * que ésta es justamente la pantalla donde un admin va a ver quién está
 * dentro. Una sesión abierta que no debería estarlo quedaba escondida
 * entre decenas de fantasmas, que es el peor sitio para tener ruido.
 *
 * Filtrar no borra: limpiar la tabla es trabajo de `scripts/podar-logs.ts`.
 * Una lectura no muta.
 */
export async function listarSesionesActivas(): Promise<SesionActivaDTO[]> {
  const ahora = new Date();
  const sesiones = await prisma.sesion.findMany({
    where: {
      expiraEn: { gt: ahora },
      ultimaActividad: { gt: limiteDeInactividad(ahora) },
      // `leerSesion()` también corta la sesión de un usuario desactivado;
      // sin esto, desactivar a alguien lo dejaba visible como "activo".
      usuario: { activo: true },
    },
    orderBy: { ultimaActividad: "desc" },
    include: { usuario: { select: { nombreCompleto: true, username: true } } },
  });

  return sesiones.map((s) => ({
    id: s.id,
    usuarioId: s.usuarioId,
    usuarioNombre: s.usuario.nombreCompleto,
    username: s.usuario.username,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    creadaEn: fechaHoraAString(s.creadaEn),
    ultimaActividad: fechaHoraAString(s.ultimaActividad),
    expiraEn: fechaHoraAString(s.expiraEn),
  }));
}

// Cierre forzado por un admin — distinto de destruirSesionActual()
// (server/auth/session.ts), que solo borra la cookie/fila del usuario
// actual. Aquí el admin termina la sesión de otra persona.
export async function cerrarSesion(actor: ActorAuditoria, sesionId: number): Promise<void> {
  if (!puedeGestionarUsuarios(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction(async (tx) => {
    const sesion = await tx.sesion.findUniqueOrThrow({ where: { id: sesionId } });
    await tx.sesion.delete({ where: { id: sesionId } });

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "cerrar_sesion",
      tablaAfectada: "sesiones",
      registroId: String(sesionId),
      datosAnteriores: { usuarioId: sesion.usuarioId },
    });
  });
}
