import { z } from "zod";
import { REGEX_MONTO } from "@/lib/money";
import {
  esquemaFecha,
  campoTextoRequerido,
  campoTextoLibreOpcional,
} from "@/lib/sanitizacion";

// docs/DOMINIO.md: monto_credito SIEMPRE se deriva de los artículos, tanto
// al crear como al editar (el legacy solo lo hacía al editar) — por eso no
// se recibe monto_credito del formulario, se calcula en el servicio.
// `.nullish()`, no `.optional()`: ver la misma nota en lib/schemas/venta.ts
// — el cliente manda `idCatalogo: null` explícito, no lo omite.
export const esquemaArticuloDevolucion = z.object({
  idCatalogo: z.coerce.number().int().positive().nullish(),
  nombre: campoTextoRequerido(200, "El nombre del artículo es obligatorio"),
  cantidad: z
    .coerce
    .number()
    .int()
    .positive("La cantidad debe ser mayor a 0")
    .max(999999, "Cantidad fuera de rango"),
  // El precio al que la pieza se VENDIÓ. No es lo que se le acredita al
  // cliente (eso es `precioCredito`): es la identidad del artículo cuando no
  // hay vínculo con el catálogo — ver lib/articulos.ts.
  precioUnitario: z
    .string()
    .trim()
    .max(12, "Precio fuera de rango")
    .regex(REGEX_MONTO, "Precio inválido"),
  // Lo que de verdad se acredita por pieza, cuando la pieza vuelve con
  // desgaste y no se le reconoce el precio completo. Ausente o null = se
  // acredita el precio de venta. El tope contra `precioUnitario` NO se
  // valida aquí: zod ve un artículo a la vez y el mensaje tiene que nombrar
  // la pieza, así que vive en el servicio (que además es el gate real,
  // regla 7).
  // `.nullish()` sin transform: así el campo queda OPCIONAL en el tipo
  // inferido y quien no ajusta ningún precio —el caso normal, y todo
  // llamador anterior a esto— no tiene que escribir `precioCredito: null`
  // para compilar. Una cadena vacía no llega a ser null: falla el regex,
  // que es lo correcto para un POST directo con el campo en blanco.
  precioCredito: z
    .string()
    .trim()
    .max(12, "Monto fuera de rango")
    .regex(REGEX_MONTO, "Monto a acreditar inválido")
    .nullish(),
});

export const esquemaDevolucion = z.object({
  idCliente: z.coerce.number().int().positive("Cliente inválido"),
  fecha: esquemaFecha,
  motivo: campoTextoLibreOpcional(2000),
  articulos: z
    .array(esquemaArticuloDevolucion)
    .min(1, "Agrega al menos un artículo")
    .max(100, "No se pueden devolver más de 100 artículos a la vez"),
});

export type DatosDevolucion = z.infer<typeof esquemaDevolucion>;
