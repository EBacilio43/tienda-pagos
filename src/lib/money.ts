import type { Prisma } from "@prisma/client";

// AGENTS.md regla 1: Decimal en el servidor, string en la frontera RSC,
// nunca Number()/parseFloat() sobre un campo monetario — ni siquiera para
// mostrarlo. `formatearMoneda` formatea el string a mano, sin pasar por
// punto flotante.

export function decimalAString(monto: Prisma.Decimal): string {
  return monto.toFixed(2);
}

// Patrones para schemas Zod — validación puramente textual, nunca Number().
export const REGEX_MONTO = /^\d{1,9}(\.\d{1,2})?$/;
export const REGEX_MONTO_POSITIVO = /^(?!0+(\.0+)?$)\d{1,9}(\.\d{1,2})?$/;

// Aritmética client-safe (sin Prisma.Decimal, que no debe llegar al
// bundle del cliente) para previews en formularios — p. ej. el total de una
// venta mientras se arman los artículos. Vía centavos como BigInt, nunca
// Number()/parseFloat() sobre el monto.
function aCentavos(monto: string): bigint {
  const texto = monto.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = negativo ? texto.slice(1) : texto;
  const [entero, decimalesCrudos = ""] = sinSigno.split(".");
  const decimales = decimalesCrudos.padEnd(2, "0").slice(0, 2);
  const valor = BigInt((entero || "0") + decimales);
  return negativo ? -valor : valor;
}

function centavosAMonto(centavos: bigint): string {
  const negativo = centavos < BigInt(0);
  const abs = negativo ? -centavos : centavos;
  const texto = abs.toString().padStart(3, "0");
  const entero = texto.slice(0, -2);
  const decimales = texto.slice(-2);
  return `${negativo ? "-" : ""}${entero}.${decimales}`;
}

export function sumarMontos(...montos: string[]): string {
  return centavosAMonto(montos.reduce((acc, m) => acc + aCentavos(m), BigInt(0)));
}

export function restarMontos(a: string, b: string): string {
  return centavosAMonto(aCentavos(a) - aCentavos(b));
}

// `cantidad` es un conteo de artículos (entero), no dinero — no viola la
// regla 1 convertirlo, solo se prohíbe convertir el monto mismo.
export function multiplicarMonto(monto: string, cantidad: number): string {
  return centavosAMonto(aCentavos(monto) * BigInt(Math.trunc(cantidad)));
}

// Compara dos montos como montos, no como texto: "2500" y "2500.00" son el
// mismo dinero y `===` diría que no. Devuelve <0, 0 o >0 igual que un
// comparador de `sort`. Client-safe por el mismo motivo que las de arriba —
// la usa el formulario de devolución para no dejar acreditar de más antes de
// mandar nada al servidor.
export function compararMontos(a: string, b: string): number {
  const diferencia = aCentavos(a) - aCentavos(b);
  return diferencia === BigInt(0) ? 0 : diferencia > BigInt(0) ? 1 : -1;
}

export function formatearMoneda(monto: string): string {
  const texto = monto.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = negativo ? texto.slice(1) : texto;
  const [entero, decimalesCrudos = ""] = sinSigno.split(".");
  const conSeparadores = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimales = decimalesCrudos.padEnd(2, "0").slice(0, 2);
  return `${negativo ? "-" : ""}$${conSeparadores}.${decimales}`;
}
