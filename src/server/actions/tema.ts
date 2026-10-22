"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_TEMA, esTema } from "@/lib/tema";

// Fase 9 / ADR-17. Esta Server Action es un endpoint HTTP público
// descubrible en el bundle de producción (regla 7) — por eso valida con
// esTema() en vez de confiar en el <select>/<button> del cliente. No lleva
// `actor` ni auditoría (regla 5): es una preferencia visual de UI, no un
// servicio mutante de dominio, y /login también la usa sin sesión.
export async function establecerTemaAction(formData: FormData): Promise<void> {
  const valor = formData.get("tema");
  if (!esTema(valor)) return;

  (await cookies()).set(COOKIE_TEMA, valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // El layout raíz lee la cookie para decidir la clase del <html> — hay
  // que forzar su re-render o el cambio de tema no se ve hasta la
  // siguiente navegación completa.
  revalidatePath("/", "layout");
}
