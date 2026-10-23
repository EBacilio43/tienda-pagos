import { z } from "zod";
import {
  campoTextoOpcional,
  campoTextoRequerido,
  sanitizarCadena,
} from "@/lib/sanitizacion";

// Isomórfico a propósito (AGENTS.md): el mismo schema alimenta zodResolver
// en el formulario y schema.parse() en el Server Action.
export const campoOpcional = campoTextoOpcional;

export function normalizarNombre(nombre: string): string {
  return sanitizarCadena(nombre);
}

export const esquemaCliente = z.object({
  nombre: campoTextoRequerido(150, "El nombre es obligatorio"),
  email: z
    .string()
    .max(150, "Máximo 150 caracteres")
    .nullish()
    .transform((v) => {
      if (!v) return undefined;
      const s = sanitizarCadena(v);
      return s.length > 0 ? s : undefined;
    })
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email inválido"),
  telefono: campoTextoOpcional(20),
  empresa: campoTextoOpcional(150),
  calle: campoTextoOpcional(200),
  numExt: campoTextoOpcional(20),
  numInt: campoTextoOpcional(20),
  colonia: campoTextoOpcional(100),
  municipio: campoTextoOpcional(100),
  estado: campoTextoOpcional(100),
  cp: campoTextoOpcional(10),
});

export type DatosCliente = z.infer<typeof esquemaCliente>;
