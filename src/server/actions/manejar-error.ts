import { ErrorPermiso } from "@/lib/permisos";
import { ErrorDominio } from "@/lib/errores";
import { logError } from "@/server/log";

const MENSAJE_GENERICO = "Ocurrió un error inesperado. Intenta de nuevo o contacta a soporte.";

// único punto donde un catch de Server Action decide qué
// mensaje devolver. `ErrorPermiso`/`ErrorDominio` son mensajes de negocio,
// ya redactados para el usuario — se devuelven tal cual. Cualquier otra
// cosa (Prisma, red, un bug) se registra con contexto (quién, qué acción,
// qué ids) y el usuario solo ve un mensaje genérico — nunca el `.message`
// crudo, que puede traer detalles del esquema o la conexión.
export function mensajeDeError(err: unknown, contexto: Record<string, unknown>): string {
  if (err instanceof ErrorPermiso || err instanceof ErrorDominio) {
    return err.message;
  }
  logError(contexto, err);
  return MENSAJE_GENERICO;
}
