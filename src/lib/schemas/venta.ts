import { z } from "zod";
import { REGEX_MONTO, REGEX_MONTO_POSITIVO } from "@/lib/money";
import {
  esquemaFecha,
  campoTextoRequerido,
} from "@/lib/sanitizacion";

// ADR-10: alta de venta en una sola página, no wizard.
// idCatalogo es opcional — un artículo de venta puede ser una
// pieza única capturada a mano (nombre + precio), sin vínculo al catálogo.
// Cuando no hay vínculo, no hay stock que descontar (server/services/stock.ts
// se salta por completo, regla 4 se sostiene vacíamente para esa línea).
// `.nullish()`, no `.optional()`: el cliente manda `idCatalogo: null`
// explícito (no lo omite) — `.optional()` solo acepta `undefined` y
// `z.coerce.number()` convierte `null` a 0, que falla `.positive()`.
export const esquemaArticuloVenta = z.object({
  idCatalogo: z.coerce.number().int().positive().nullish(),
  nombre: campoTextoRequerido(200, "El nombre del artículo es obligatorio"),
  cantidad: z
    .coerce
    .number()
    .int()
    .positive("La cantidad debe ser mayor a 0")
    .max(999999, "Cantidad fuera de rango"),
  precioUnitario: z
    .string()
    .trim()
    .max(12, "Precio fuera de rango")
    .regex(REGEX_MONTO, "Precio inválido"),
});

// Esquema de validacion para el registro de ventas.
export const esquemaVenta = z
  .object({
    idCliente: z.coerce.number().int().positive("Cliente inválido"),
    fecha: esquemaFecha,
    esquemaPago: z.enum(["Contado", "Pagos"]),
    frecuenciaPago: z.enum(["Semanal", "Quincenal", "Mensual"]).optional(),
    tieneEnganche: z.boolean(),
    enganche: z
      .string()
      .trim()
      .max(12, "Enganche fuera de rango")
      .regex(REGEX_MONTO, "Enganche inválido")
      .optional(),
    articulos: z
      .array(esquemaArticuloVenta)
      .min(1, "Agrega al menos un artículo")
      .max(100, "No se pueden registrar más de 100 artículos por venta"),
  })
  .refine((datos) => datos.esquemaPago !== "Pagos" || !!datos.frecuenciaPago, {
    message: "Especifica la frecuencia de pago",
    path: ["frecuenciaPago"],
  })
  .refine(
    (datos) => !datos.tieneEnganche || (!!datos.enganche && REGEX_MONTO_POSITIVO.test(datos.enganche)),
    { message: "Especifica el monto del enganche", path: ["enganche"] }
  );

export type DatosVenta = z.infer<typeof esquemaVenta>;
