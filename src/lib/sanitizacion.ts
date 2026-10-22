import { z } from "zod";
import { REGEX_MONTO, REGEX_MONTO_POSITIVO } from "@/lib/money";

/**
 * Helpers y utilidades de sanitización y validación estricta de entradas.
 * (/ AGENTS.md Regla 1 y Regla 2).
 */

// Caracteres de control ASCII (0x00-0x1F, 0x7F) y C1 (0x80-0x9F), más caracteres
// invisibles / zero-width de Unicode (ZWSP, ZWNJ, ZWJ, marcas LTR/RTL, BOM).
export const REGEX_CONTROL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g;

// Igual que REGEX_CONTROL pero excluyendo saltos de línea y tabuladores:
// \t (\u0009), \n (\u000A), \r (\u000D).
export const REGEX_CONTROL_MULTILINEA =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g;

// Tags HTML (ej. <script>, <b>, <img ...>, comentarios <!-- ... -->, etc.)
export const REGEX_HTML_TAGS = /<(?:\/?[a-zA-Z][^>]*|!--[\s\S]*?--|\?[^>]*?)>/g;

/**
 * Elimina caracteres de control y caracteres invisibles.
 * @param texto Cadena a limpiar
 * @param permitirSaltos Si es true, preserva saltos de línea (\r, \n) y tabs (\t)
 */
export function limpiarCaracteresControl(texto: string, permitirSaltos = false): string {
  return texto.replace(permitirSaltos ? REGEX_CONTROL_MULTILINEA : REGEX_CONTROL, "");
}

/**
 * Elimina bloques <script> y <style> junto con su contenido, así como cualquier
 * tag HTML (<...>), previniendo bypasses por anidamiento (ej. <<script>...).
 * En campos multilínea, reemplaza <br> y </p> con saltos de línea antes de eliminar tags.
 */
export function limpiarHtml(texto: string, multiline = false): string {
  let s = texto
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  if (multiline) {
    s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  }

  let anterior: string;
  do {
    anterior = s;
    s = s.replace(REGEX_HTML_TAGS, "");
  } while (s !== anterior);

  return s;
}

/**
 * Colapsa múltiples espacios en blanco a un solo espacio y aplica trim().
 */
export function colapsarEspacios(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Normaliza espacios en blanco en campos multilínea:
 * - Unifica \r\n y \r a \n.
 * - Colapsa espacios horizontales continuos en una misma línea a uno solo.
 * - Colapsa 3 o más saltos de línea consecutivos a máximo 2.
 * - Aplica trim() general.
 */
export function normalizarEspaciosMultilinea(texto: string): string {
  return texto
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((linea) => linea.replace(/[^\S\r\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sanitiza campos de texto de una sola línea (nombres, teléfonos, empresas, direcciones, etc.):
 * 1. Remueve caracteres de control e invisibles (incluyendo saltos de línea).
 * 2. Remueve tags y bloques HTML.
 * 3. Colapsa secuencias de espacios a un solo espacio y hace trim().
 */
export function sanitizarCadena(texto: string): string {
  const sinControl = limpiarCaracteresControl(texto, false);
  const sinHtml = limpiarHtml(sinControl, false);
  return colapsarEspacios(sinHtml);
}

/**
 * Sanitiza campos de texto libre multilínea (descripciones, notas de venta, motivos de devolución):
 * 1. Remueve caracteres de control e invisibles pero preserva saltos de línea.
 * 2. Convierte tags de salto HTML a \n y remueve cualquier tag/bloque HTML.
 * 3. Normaliza espacios horizontales y saltos excesivos, aplicando trim().
 */
export function sanitizarTextoLibre(texto: string): string {
  const sinControl = limpiarCaracteresControl(texto, true);
  const sinHtml = limpiarHtml(sinControl, true);
  return normalizarEspaciosMultilinea(sinHtml);
}

/**
 * Validador estricto de fechas calendario (Regla 2).
 * Formato obligatorio: YYYY-MM-DD.
 * Verifica la existencia real del día en el calendario gregoriano (ej. rechaza 2026-02-29 o 2026-13-40).
 */
export const esquemaFecha = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida: se espera formato AAAA-MM-DD")
  .refine(
    (f) => {
      const d = new Date(`${f}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
    },
    { message: "Fecha inexistente en el calendario" }
  );

/**
 * Validador de montos monetarios (Regla 1).
 * Nunca pasa por Number()/parseFloat().
 */
export const esquemaMonto = z
  .string()
  .trim()
  .max(12, "Monto fuera de rango")
  .regex(REGEX_MONTO, "Monto inválido — usa números y hasta 2 decimales");

export const esquemaMontoPositivo = z
  .string()
  .trim()
  .max(12, "Monto fuera de rango")
  .regex(REGEX_MONTO_POSITIVO, "El monto debe ser mayor a 0 y tener hasta 2 decimales");

/**
 * Helper Zod para un campo de texto de una sola línea opcional (nullish).
 * - Enforce de límite máximo en el input crudo para evitar payloads gigantes.
 * - Sanitiza caracteres de control, HTML y espacios.
 * - Transforma valores vacíos a `undefined`.
 */
export const campoTextoOpcional = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => {
      if (!v) return undefined;
      const s = sanitizarCadena(v);
      return s.length > 0 ? s : undefined;
    });

/**
 * Helper Zod para texto libre multilínea opcional (nullish).
 * - Enforce de límite máximo en el input crudo.
 * - Sanitiza caracteres de control, HTML y normaliza saltos de línea.
 * - Transforma valores vacíos a `undefined`.
 */
export const campoTextoLibreOpcional = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => {
      if (!v) return undefined;
      const s = sanitizarTextoLibre(v);
      return s.length > 0 ? s : undefined;
    });

/**
 * Helper Zod para un campo de texto de una sola línea obligatorio.
 * - Enforce de límite máximo crudo.
 * - Sanitización completa.
 * - Valida longitud mínima 1 tras la sanitización.
 */
export const campoTextoRequerido = (max: number, mensajeRequerido = "Este campo es obligatorio") =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .transform(sanitizarCadena)
    .pipe(z.string().min(1, mensajeRequerido).max(max, `Máximo ${max} caracteres`));
