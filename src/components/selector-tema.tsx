import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import { establecerTemaAction } from "@/server/actions/tema";
import type { Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";

const OPCIONES = [
  { valor: "claro", etiqueta: "Claro", Icono: Sun },
  { valor: "oscuro", etiqueta: "Oscuro", Icono: Moon },
  { valor: "sistema", etiqueta: "Sistema", Icono: MonitorSmartphone },
] as const;

// Fase 9 / ADR-17. Server Component, cero JavaScript — igual que el
// <form action="/api/auth/logout"> con el que ahora comparte el pie del
// sidebar (components/pie-sidebar.tsx). Cada botón es su propio submit: no
// hace falta un componente cliente ni onChange para elegir tema.
//
// Los colores son tokens de `sidebar` y no los de cromo general: desde que
// esto vive dentro del sidebar, el fondo es el navy sólido en los DOS temas,
// así que `bg-muted`/`text-foreground` —que se definen contra el fondo de la
// página— daban una píldora clara sobre navy en modo claro (regla 10: el
// token tiene que ser el de la superficie donde se pinta, no el de al lado).
export function SelectorTema({ tema }: { tema: Tema }) {
  return (
    <div className="mb-1 flex items-center gap-0.5 rounded-lg border border-sidebar-border p-0.5">
      {OPCIONES.map(({ valor, etiqueta, Icono }) => (
        <form key={valor} action={establecerTemaAction} className="flex-1">
          <input type="hidden" name="tema" value={valor} />
          <button
            type="submit"
            aria-pressed={tema === valor}
            title={etiqueta}
            className={cn(
              "flex h-10 sm:h-7 min-h-[44px] sm:min-h-0 w-full items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:text-sidebar-accent-foreground touch-manipulation",
              tema === valor && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            )}
          >
            <Icono className="size-4" />
            <span className="sr-only">Tema {etiqueta.toLowerCase()}</span>
          </button>
        </form>
      ))}
    </div>
  );
}
