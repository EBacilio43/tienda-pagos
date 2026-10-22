import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Fase 9 / ADR-17. Reemplaza los 7 sitios "rounded-md border" (a veces con
// "mt-4", a veces sin él) y envuelve las 4 tablas de clientes/[id] que hoy
// no tienen panel — la inconsistencia real que motivó extraerlo.
export function PanelTabla({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>{children}</div>;
}
