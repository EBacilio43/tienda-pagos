import "server-only";
import { redirect } from "next/navigation";
import type { Usuario } from "@prisma/client";
import { leerSesion } from "./session";
import type { Rol } from "@/types/dominio";

/**
 * Capa 2 de la defensa en profundidad (AGENTS.md regla 7): el middleware
 * solo redirige por UX si falta la cookie. Esto sí autoriza — corre en
 * Node, contra la BD.
 */
export async function requireUser(): Promise<Usuario> {
  const usuario = await leerSesion();
  if (!usuario) {
    redirect("/login");
  }
  return usuario;
}

export async function requireRole(...roles: Rol[]): Promise<Usuario> {
  const usuario = await requireUser();
  if (!roles.includes(usuario.rol as Rol)) {
    redirect("/");
  }
  return usuario;
}
