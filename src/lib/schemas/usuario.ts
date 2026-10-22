import { z } from "zod";
import { campoTextoRequerido, sanitizarCadena } from "@/lib/sanitizacion";

const ROL = z.enum(["consulta", "operador", "admin"]);

export const esquemaPassword = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(128, "Máximo 128 caracteres")
  .regex(/[a-zA-Z]/, "Debe contener al menos una letra")
  .regex(/[0-9]/, "Debe contener al menos un número");

export const esquemaUsuario = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mínimo 3 caracteres")
    .max(50, "Máximo 50 caracteres")
    .regex(/^[a-z0-9._-]+$/, "Solo minúsculas, números, punto, guion y guion bajo — sin espacios"),
  nombreCompleto: campoTextoRequerido(100, "El nombre completo es obligatorio"),
  email: z
    .string()
    .max(120, "Máximo 120 caracteres")
    .nullish()
    .transform((v) => {
      if (!v) return undefined;
      const s = sanitizarCadena(v);
      return s.length > 0 ? s : undefined;
    })
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email inválido"),
  rol: ROL,
  password: esquemaPassword,
});

export type DatosUsuario = z.infer<typeof esquemaUsuario>;

export const esquemaEditarUsuario = z.object({
  nombreCompleto: campoTextoRequerido(100, "El nombre completo es obligatorio"),
  email: z
    .string()
    .max(120, "Máximo 120 caracteres")
    .nullish()
    .transform((v) => {
      if (!v) return undefined;
      const s = sanitizarCadena(v);
      return s.length > 0 ? s : undefined;
    })
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email inválido"),
  rol: ROL,
  activo: z.boolean(),
});

export type DatosEditarUsuario = z.infer<typeof esquemaEditarUsuario>;

export const esquemaResetPassword = z
  .object({
    password: esquemaPassword,
    confirmar: z.string().min(1, "Confirma la contraseña").max(128, "Máximo 128 caracteres"),
  })
  .refine((v) => v.password === v.confirmar, {
    message: "Las contraseñas no coinciden",
    path: ["confirmar"],
  });

export type DatosResetPassword = z.infer<typeof esquemaResetPassword>;

export const esquemaCambiarPasswordPropia = z
  .object({
    passwordActual: z.string().min(1, "Ingresa tu contraseña actual").max(128, "Máximo 128 caracteres"),
    passwordNueva: esquemaPassword,
    confirmar: z.string().min(1, "Confirma la nueva contraseña").max(128, "Máximo 128 caracteres"),
  })
  .refine((v) => v.passwordNueva === v.confirmar, {
    message: "Las contraseñas no coinciden",
    path: ["confirmar"],
  });

export type DatosCambiarPasswordPropia = z.infer<typeof esquemaCambiarPasswordPropia>;
