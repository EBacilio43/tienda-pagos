"use server";

import { requireUser } from "@/server/auth/guards";
import { obtenerSnapshotSistema } from "@/server/services/sistema";
import { puedeGestionarUsuarios, ErrorPermiso } from "@/lib/permisos";
import { mensajeDeError } from "@/server/actions/manejar-error";
import type { Rol, SnapshotSistema } from "@/types/dominio";

export type ResultadoSnapshot =
  | { ok: true; snapshot: SnapshotSistema }
  | { ok: false; mensaje: string };

/**
 * El refresco en vivo del panel de /admin/sistema.
 *
 * Autoriza aquí, y no solo en la página (regla 7): una Server Action es un
 * endpoint HTTP público cuyo ID es descubrible en el bundle de producción,
 * así que `requireRole` en el Server Component de la pantalla no protege
 * nada de esto. Y lo que devuelve —hostname, versiones, tamaño de la base,
 * número de conexiones— es exactamente el material que sirve para
 * reconocer una instalación desde fuera.
 *
 * No hay revalidatePath: no muta nada, y el panel se pinta con lo que
 * devuelve, no con el HTML de la ruta.
 */
export async function obtenerSnapshotSistemaAction(): Promise<ResultadoSnapshot> {
  const actor = await requireUser();

  try {
    if (!puedeGestionarUsuarios(actor.rol as Rol)) throw new ErrorPermiso();
    return { ok: true, snapshot: await obtenerSnapshotSistema() };
  } catch (err) {
    return {
      ok: false,
      mensaje: mensajeDeError(err, { accion: "obtenerSnapshotSistema", actorId: actor.id }),
    };
  }
}
