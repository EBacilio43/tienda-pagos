// Fase 9 / ADR-17. Compartido servidor/cliente — no importa @/server/*, así
// que la regla 6 (y su regla ESLint) no aplican aquí, igual que fecha.ts o
// money.ts.
export const COOKIE_TEMA = "tema";

export const TEMAS = ["claro", "oscuro", "sistema"] as const;

export type Tema = (typeof TEMAS)[number];

export function esTema(valor: unknown): valor is Tema {
  return typeof valor === "string" && (TEMAS as readonly string[]).includes(valor);
}
