import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { claseControl } from "@/components/ui/control"

// Fase 9 / ADR-17. <select> nativo a propósito, no el Select de
// @base-ui/react: son 6 selects de 2-4 opciones en una app de escritorio,
// y el nativo hereda gratis el estilado oscuro vía `color-scheme` (ver
// globals.css), el teclado y el picker de móvil — un listbox con portal
// aquí sería la abstracción especulativa que prohíbe la regla 9.
// El panel desplegable lo dibuja el navegador a partir del fondo del
// <select>, y claseControl lo trae TRANSLÚCIDO (`dark:bg-input/30`), que
// para un <input> da igual pero aquí hace que en oscuro Chrome/Edge pinten
// la lista casi blanca con texto claro encima. Por eso el fondo se vuelve
// opaco solo aquí —no en claseControl, que comparte con Input, donde la
// translucidez sí es intencional— y los <option> reciben explícitamente
// los tokens de popover, que es lo que son: una lista flotante.
// tailwind-merge deja ganar a estas clases por venir después.
// En Safari/macOS los <option> los dibuja el sistema y esto se ignora; ahí
// el arreglo que sí aplica es `color-scheme`, que ya está puesto.
const claseSelect =
  "appearance-none pr-8 bg-card dark:bg-input [&>option]:bg-popover [&>option]:text-popover-foreground";

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(claseControl, claseSelect, className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { Select }
