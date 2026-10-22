import "server-only";
import type { Usuario } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const MAX_INTENTOS_FALLIDOS = 5;
export const MINUTOS_BLOQUEO = 15;

export function estaBloqueado(usuario: Pick<Usuario, "bloqueadoHasta">): boolean {
  return usuario.bloqueadoHasta !== null && usuario.bloqueadoHasta > new Date();
}

export type ResultadoIntentoFallido = {
  /** Cuántos fallos lleva la cuenta contando el que se acaba de registrar. */
  intentosFallidos: number;
  bloqueado: boolean;
};

/**
 * Defecto legacy (models.py:177-180): `intentos_fallidos` nunca se
 * reseteaba al expirar `bloqueado_hasta`, así que un solo intento fallido
 * después de la ventana volvía a bloquear de inmediato — un trinquete
 * permanente de 1 intento cada 15 min. Aquí, si el bloqueo ya expiró, el
 * contador se resetea ANTES de contar el intento actual.
 *
 * El conteo va con un `increment` atómico y no con leer-calcular-escribir,
 * por lo mismo que `ajustarStockTx` dejó de hacerlo (): entre el
 * SELECT y el UPDATE cabe otro request. Aquí el lost update no era un
 * descuadre de inventario sino el freno de fuerza bruta entero — N logins
 * fallidos en paralelo leían todos `intentosFallidos = 0` y escribían todos
 * `1`, así que el tope de 5 se podía pasar por mucho mandando los intentos a
 * la vez en vez de en fila. Con `increment` bajo el lock de fila de Postgres
 * cada request recibe un número distinto, y el que cruza el umbral es
 * exactamente uno.
 */
export async function registrarIntentoFallido(
  usuario: Usuario
): Promise<ResultadoIntentoFallido> {
  // Condicional en el WHERE, no en JS: si el bloqueo ya venció se limpia sin
  // pisar el de nadie más. Un `bloqueadoHasta` NULL no cumple `lte` (lógica
  // de tres valores de SQL), así que este UPDATE no toca a quien nunca
  // estuvo bloqueado.
  await prisma.usuario.updateMany({
    where: { id: usuario.id, bloqueadoHasta: { lte: new Date() } },
    data: { intentosFallidos: 0, bloqueadoHasta: null },
  });

  const { intentosFallidos } = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { intentosFallidos: { increment: 1 } },
    select: { intentosFallidos: true },
  });

  if (intentosFallidos < MAX_INTENTOS_FALLIDOS) {
    return { intentosFallidos, bloqueado: false };
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { bloqueadoHasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60_000) },
  });
  return { intentosFallidos, bloqueado: true };
}

export async function registrarLoginExitoso(usuarioId: number): Promise<void> {
  const ahora = new Date();
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      intentosFallidos: 0,
      bloqueadoHasta: null,
      ultimoLogin: ahora,
      ultimaActividad: ahora,
    },
  });
}
