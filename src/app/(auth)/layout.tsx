import type { ReactNode } from "react";

// Fase 9 / ADR-17. No existía layout para (auth) — /login se centraba
// solo. El tema (claro/oscuro/sistema) se hereda del layout raíz, así que
// funciona aquí también, antes de autenticarse.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted p-4">{children}</div>;
}
