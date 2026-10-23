/**
 * sesiones_log se escribe en cada intento de login,
 * auditoria en cada mutación — ninguna de las dos se poda nunca. Este
 * script aplica una política de retención explícita en vez de dejarlas
 * crecer sin límite.
 *
 * Ventanas de retención (ajustar aquí si la política cambia, no en otro
 * lado):
 * - sesiones_log: 90 días. Es telemetría de seguridad (intentos de login,
 *   ipBloqueada() la consulta en cada intento) — valor decae rápido.
 * - auditoria: 730 días (2 años). Es el rastro de quién cambió qué en el
 *   negocio (ventas, pagos, devoluciones, stock) — vale más tiempo que un
 *   log de acceso, por si hace falta reconstruir una disputa.
 * - sesiones: sin ventana, y a propósito. Las otras dos son historia y hay
 *   que decidir cuánta guardar; `sesiones` es ESTADO, y una fila que ya no
 *   puede autenticar no vale nada: nada la revive, y el rastro de quién
 *   entró y cuándo ya vive en `sesiones_log`, que es para eso. Se borra en
 *   cuanto está muerta, con el mismo criterio que usa `leerSesion()`.
 *
 * Por qué hacía falta: una sesión expirada solo se borra si alguien vuelve
 * a presentar su cookie, y casi nadie vuelve — se cierra la pestaña y ya.
 * En la base de desarrollo, al 2026-09-03, 34 de 35 filas eran basura.
 *
 * Por default corre en modo DRY RUN (solo cuenta, no borra) — hay que
 * pasar --aplicar explícitamente para borrar de verdad. Mismo principio
 * que cualquier operación destructiva en este proyecto: medir antes de
 * cortar.
 *
 * Uso:
 *   npx tsx scripts/podar-logs.ts             # solo reporta qué borraría
 *   npx tsx scripts/podar-logs.ts --aplicar    # borra de verdad
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { limiteDeInactividad, TIMEOUT_INACTIVIDAD_HORAS } from "@/lib/sesion";

const prisma = new PrismaClient();

const DIAS_RETENCION_SESIONES_LOG = 90;
const DIAS_RETENCION_AUDITORIA = 730;

function fechaLimite(dias: number): Date {
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  return limite;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const limiteSesionesLog = fechaLimite(DIAS_RETENCION_SESIONES_LOG);
  const limiteAuditoria = fechaLimite(DIAS_RETENCION_AUDITORIA);

  // Muerta = lo que `leerSesion()` rechazaría: pasó su tope absoluto, o
  // lleva más de la ventana de inactividad sin usarse. Los dos criterios
  // salen de lib/sesion.ts, la misma fuente que la autenticación.
  const ahora = new Date();
  const sesionesMuertas = {
    OR: [
      { expiraEn: { lt: ahora } },
      { ultimaActividad: { lt: limiteDeInactividad(ahora) } },
    ],
  };

  const candidatosSesiones = await prisma.sesion.count({ where: sesionesMuertas });
  const candidatosSesionesLog = await prisma.sesionLog.count({
    where: { timestamp: { lt: limiteSesionesLog } },
  });
  const candidatosAuditoria = await prisma.auditoria.count({
    where: { timestamp: { lt: limiteAuditoria } },
  });
  const candidatosTokens = await prisma.idempotenciaToken.count({
    where: { expiraEn: { lt: ahora } },
  });

  console.log(
    `sesiones:     ${candidatosSesiones} fila(s) que ya no pueden autenticar (expiradas o inactivas > ${TIMEOUT_INACTIVIDAD_HORAS} h).`
  );
  console.log(
    `sesiones_log: ${candidatosSesionesLog} fila(s) anteriores a ${limiteSesionesLog.toISOString().slice(0, 10)} (retención: ${DIAS_RETENCION_SESIONES_LOG} días).`
  );
  console.log(
    `auditoria:    ${candidatosAuditoria} fila(s) anteriores a ${limiteAuditoria.toISOString().slice(0, 10)} (retención: ${DIAS_RETENCION_AUDITORIA} días).`
  );
  console.log(
    `idempotencia: ${candidatosTokens} token(s) expirados.`
  );

  if (!aplicar) {
    console.log("\nModo DRY RUN — nada se borró. Corre con --aplicar para borrar de verdad.");
    return;
  }

  const borradosSesiones = await prisma.sesion.deleteMany({ where: sesionesMuertas });
  const borradosSesionesLog = await prisma.sesionLog.deleteMany({
    where: { timestamp: { lt: limiteSesionesLog } },
  });
  const borradosAuditoria = await prisma.auditoria.deleteMany({
    where: { timestamp: { lt: limiteAuditoria } },
  });
  const borradosTokens = await prisma.idempotenciaToken.deleteMany({
    where: { expiraEn: { lt: ahora } },
  });

  console.log(
    `\n✓ Borrados: ${borradosSesiones.count} de sesiones, ${borradosSesionesLog.count} de sesiones_log, ${borradosAuditoria.count} de auditoria, ${borradosTokens.count} de tokens.`
  );
}

main()
  .catch((err) => {
    console.error("Error corriendo podar-logs:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
