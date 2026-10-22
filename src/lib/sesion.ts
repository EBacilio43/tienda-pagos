// Las dos ventanas que definen si una sesión sigue viva. Viven aquí, y no
// en `server/auth/session.ts` donde nacieron, porque tres sitios las
// necesitan y solo uno de ellos puede importar código de servidor:
//
// - `server/auth/session.ts` — las aplica al validar cada request.
// - `server/services/sesiones.ts` — la pantalla de sesiones activas tiene
//   que decidir lo mismo, o muestra como activo lo que la autenticación ya
//   rechaza.
// - `scripts/podar-logs.ts` — borra lo que ya no puede autenticar, y es un
//   script de Node plano: importar `session.ts` reventaría, porque el
//   paquete `server-only` falla en cualquier Node fuera del bundler.
//
// Si estos números se duplican, se separan; y el día que se separen, la
// pantalla de seguridad empieza a mentir sin que falle nada.

/** Tope duro: pasadas estas horas desde el login, la sesión muere aunque se esté usando. */
export const DURACION_ABSOLUTA_HORAS = 24;

/** Inactividad tolerada: sin actividad por más de esto, la sesión muere. */
export const TIMEOUT_INACTIVIDAD_HORAS = 8;

/**
 * El instante antes del cual una `ultima_actividad` ya no sirve. Una sesión
 * con `ultimaActividad <= limiteDeInactividad()` está muerta.
 */
export function limiteDeInactividad(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - TIMEOUT_INACTIVIDAD_HORAS * 60 * 60 * 1000);
}
