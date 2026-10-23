import { z } from "zod";
import { REGEX_MONTO } from "@/lib/money";
import {
  campoTextoRequerido,
  campoTextoLibreOpcional,
} from "@/lib/sanitizacion";

// `precio` es un string decimal validado por regex — nunca pasa por
// Number()/parseFloat() (AGENTS.md regla 1). Prisma acepta el string
// directo para un campo Decimal.
export const esquemaArticulo = z.object({
  nombre: campoTextoRequerido(200, "El nombre es obligatorio"),
  precio: z
    .string()
    .trim()
    .max(12, "Precio fuera de rango")
    .regex(REGEX_MONTO, "Precio inválido — usa números y hasta 2 decimales"),
  descripcion: campoTextoLibreOpcional(2000),
  activo: z.boolean(),
  stockMinimo: z
    .coerce
    .number()
    .int()
    .min(0, "No puede ser negativo")
    .max(999999, "Stock mínimo fuera de rango"),
});

export type DatosArticulo = z.infer<typeof esquemaArticulo>;

export const esquemaAjusteStock = z.object({
  idCatalogo: z.coerce.number().int().positive("Artículo de catálogo inválido"),
  delta: z
    .coerce
    .number()
    .int()
    .refine((v) => v !== 0, "El ajuste no puede ser 0")
    .refine((v) => Math.abs(v) <= 999999, "Ajuste de stock fuera de rango"),
  notas: campoTextoLibreOpcional(500),
});

export type DatosAjusteStock = z.infer<typeof esquemaAjusteStock>;
