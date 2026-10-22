import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Fase 9+. Celda "etiqueta arriba, valor abajo" para las pantallas de
// detalle de venta/pago/devolución — mismo patrón visual que ResumenItem
// de clientes/[id], sin el color por tipo (aquí el valor decide su propio
// tono vía <Currency tono=.../>, esta celda es neutra).
export function Dato({
  etiqueta,
  valor,
  destacado = false,
  className,
}: {
  etiqueta: string;
  valor: ReactNode;
  destacado?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", className)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      {/* text-xl en móvil: la retícula de estas celdas es de 2 columnas en
          teléfono (~134 px útiles), y un monto de 10 dígitos a text-2xl
          pide ~145 y se desborda. */}
      <p className={cn("mt-1", destacado ? "text-xl font-bold sm:text-2xl" : "text-sm font-medium")}>
        {valor}
      </p>
    </div>
  );
}
