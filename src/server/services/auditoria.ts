import { prisma } from "@/server/db/prisma";
import { fechaHoraAString, fechaHoraSegundosAString, tiempoRelativo } from "@/lib/fecha";
import {
  construirCambios,
  etiquetaDeAccion,
  etiquetaDeTabla,
  hrefRegistroAuditado,
} from "@/lib/auditoria";
import type { AuditoriaFilaDTO } from "@/types/dominio";

const POR_PAGINA = 40;

export type AuditoriaResultado = {
  filas: AuditoriaFilaDTO[];
  total: number;
};

/**
 * Solo lectura, admin-only (ADR-09) — el gate real vive en la página vía
 * requireRole, no hace falta ErrorPermiso aquí porque no muta nada.
 *
 * El desglose de `datos_anteriores`/`datos_nuevos` se arma AQUÍ, en el
 * servidor, y cruza la frontera RSC ya resuelto a texto. La alternativa
 * —mandar los dos JSON crudos y aplanarlos en el navegador— manda al
 * cliente columnas que no se van a pintar (una venta trae su arreglo de
 * artículos completo) y repite el trabajo en cada render.
 */
export async function listarAuditoria(params: { pagina?: number }): Promise<AuditoriaResultado> {
  const pagina = Math.max(1, params.pagina ?? 1);
  const ahora = new Date();

  const [total, filas] = await Promise.all([
    prisma.auditoria.count(),
    prisma.auditoria.findMany({
      orderBy: { timestamp: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: { usuario: { select: { nombreCompleto: true, username: true } } },
    }),
  ]);

  return {
    total,
    filas: filas.map((f) => ({
      id: f.id,
      fecha: fechaHoraAString(f.timestamp),
      // Con segundos: dos renglones de la misma transacción caen en el
      // mismo minuto, y el orden entre ellos es justo lo que se viene a
      // leer cuando algo salió mal.
      fechaCompleta: fechaHoraSegundosAString(f.timestamp),
      fechaRelativa: tiempoRelativo(f.timestamp, ahora),
      usuarioNombre: f.usuario?.nombreCompleto ?? null,
      usuarioUsername: f.usuario?.username ?? null,
      accion: f.accion,
      accionEtiqueta: etiquetaDeAccion(f.accion),
      tablaAfectada: f.tablaAfectada,
      tablaEtiqueta: etiquetaDeTabla(f.tablaAfectada),
      registroId: f.registroId,
      href: hrefRegistroAuditado(f.tablaAfectada, f.registroId, f.accion),
      ipAddress: f.ipAddress,
      cambios: construirCambios(f.datosAnteriores, f.datosNuevos),
    })),
  };
}

export { POR_PAGINA as AUDITORIA_POR_PAGINA };

export type RegistroAuditoriaDTO = {
  creadoPor: string | null;
  creadoEl: string | null;
  editadoPor: string | null;
  editadoEl: string | null;
};

// Reusa las filas que registrarAuditoria (regla 5) ya escribe en la misma
// transacción de cada mutación — no es una fuente de datos nueva, es la
// misma auditoría de /admin/auditoria, filtrada a un registro puntual para
// mostrar "registrado por/editado por" en su pantalla de detalle.
export async function obtenerRegistroDeAuditoria(
  tablaAfectada: string,
  registroId: number
): Promise<RegistroAuditoriaDTO> {
  const filas = await prisma.auditoria.findMany({
    where: { tablaAfectada, registroId: String(registroId) },
    orderBy: { timestamp: "asc" },
    include: { usuario: { select: { nombreCompleto: true } } },
  });

  const creacion = filas.find((f) => f.accion === "crear");
  const ultimaEdicion = filas.filter((f) => f.accion === "actualizar").at(-1);

  return {
    creadoPor: creacion?.usuario?.nombreCompleto ?? null,
    creadoEl: creacion ? fechaHoraAString(creacion.timestamp) : null,
    editadoPor: ultimaEdicion?.usuario?.nombreCompleto ?? null,
    editadoEl: ultimaEdicion ? fechaHoraAString(ultimaEdicion.timestamp) : null,
  };
}
