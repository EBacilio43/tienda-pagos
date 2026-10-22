import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { SelectorTema } from "@/components/selector-tema";
import { claseFilaSidebar, claseFilaSidebarInactiva } from "@/components/ui/fila-sidebar";
import { cn } from "@/lib/utils";
import type { Tema } from "@/lib/tema";

// El bloque de cuenta (tema · quién soy · salir) vivía en la esquina
// derecha del header. Se movió al pie del sidebar, que es donde vive en
// cualquier aplicación con navegación lateral, y con eso el header de
// escritorio se quedó sin contenido y desapareció: cada pantalla ya trae su
// propio título con `PageHeader`.
//
// Sigue siendo Server Component y sin una línea de JavaScript de cliente —
// el selector de tema son tres <form> con Server Action y "Salir" es un
// <form method="post"> plano (ver selector-tema.tsx y api/auth/logout).
export function PieSidebar({
  tema,
  nombreCompleto,
  rol,
}: {
  tema: Tema;
  nombreCompleto: string;
  rol: string;
}) {
  return (
    <div className="mt-4 flex shrink-0 flex-col gap-1 border-t border-sidebar-border pt-3">
      <SelectorTema tema={tema} />

      <Link href="/mi-cuenta" className={cn(claseFilaSidebar, claseFilaSidebarInactiva)}>
        <UserRound className="size-4 shrink-0" />
        {/* min-w-0 + truncate: un nombre completo largo no debe ensanchar el
            sidebar ni desbordarlo. */}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{nombreCompleto}</span>
          <span className="truncate text-xs font-normal text-sidebar-foreground/60">{rol}</span>
        </span>
      </Link>

      <form action="/api/auth/logout" method="post">
        <button type="submit" className={cn(claseFilaSidebar, claseFilaSidebarInactiva, "w-full")}>
          <LogOut className="size-4 shrink-0" />
          Salir
        </button>
      </form>
    </div>
  );
}
