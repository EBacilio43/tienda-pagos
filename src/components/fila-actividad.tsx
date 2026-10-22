"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Fase 9+. Un <tr> no puede envolverse en <a> (HTML inválido, rompe la
// tabla), así que la navegación al detalle es imperativa. Se ignoran los
// clics/Enter que ya vienen de un <a> anidado (el nombre del cliente) para
// no disparar dos navegaciones a la vez.
export function FilaActividad({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function esLinkAnidado(objetivo: EventTarget | null) {
    return objetivo instanceof HTMLElement && objetivo.closest("a") !== null;
  }

  function alHacerClic(evento: MouseEvent<HTMLTableRowElement>) {
    if (esLinkAnidado(evento.target)) return;
    router.push(href);
  }

  function alPresionarTecla(evento: KeyboardEvent<HTMLTableRowElement>) {
    if (evento.key !== "Enter" || esLinkAnidado(evento.target)) return;
    router.push(href);
  }

  return (
    <TableRow
      onClick={alHacerClic}
      onKeyDown={alPresionarTecla}
      tabIndex={0}
      className={cn(
        "cursor-pointer outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
        className
      )}
    >
      {children}
    </TableRow>
  );
}
