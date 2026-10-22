import { z } from "zod";
import { REGEX_MONTO_POSITIVO } from "@/lib/money";
import {
  esquemaFecha,
  campoTextoOpcional,
  campoTextoLibreOpcional,
} from "@/lib/sanitizacion";

// Metodos de pago permitidos en el sistema, con 'Efectivo' por defecto.
// La base de datos valida este conjunto con un CHECK constraint (migracion 20260817120000_metodo_pago_cerrado).
export const METODOS_PAGO = [
  "Efectivo",
  "Transferencia",
  "Tarjeta",
  "Depósito",
  "Otro",
] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number];

export const METODO_PAGO_POR_DEFECTO: MetodoPago = "Efectivo";

export const esquemaPago = z.object({
  idCliente: z.coerce.number().int().positive("Cliente inválido"),
  fecha: esquemaFecha,
  monto: z
    .string()
    .trim()
    .max(12, "Monto fuera de rango")
    .regex(REGEX_MONTO_POSITIVO, "El monto debe ser mayor a 0"),
  metodoPago: z
    .union([z.enum(METODOS_PAGO), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : undefined)),
  referencia: campoTextoOpcional(200),
  notas: campoTextoLibreOpcional(2000),
});

export type DatosPago = z.infer<typeof esquemaPago>;

// Captura en lote: el cobro se hace en la calle durante días y se captura
// todo junto después, así que cada renglón trae su propia fecha (no la del
// día en que se teclea). El tope existe para acotar el bucle de escrituras
// dentro de la transacción — ver crearPagosEnLote.
export const LOTE_MAXIMO = 50;

export const esquemaPagosLote = z
  .array(esquemaPago)
  .min(1, "Captura al menos un abono")
  .max(LOTE_MAXIMO, `No se pueden registrar más de ${LOTE_MAXIMO} abonos a la vez`);
