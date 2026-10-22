import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BotonVolver } from "@/components/boton-volver";

// Fase 9 / ADR-17. Reemplaza el <h1 className="text-2xl font-semibold">
// copiado 22 veces y el <div className="mt-4"> que casi siempre lo seguía.
// `volver` prende el botón de regreso por defecto en las 21 pantallas que
// usan PageHeader — apagarlo explícitamente solo donde de verdad no
// aplique (p. ej. una futura pantalla de aterrizaje sin "atrás" posible).
export function PageHeader({
  titulo,
  descripcion,
  acciones,
  volver = true,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  volver?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2">
        {volver ? <BotonVolver /> : null}
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descripcion ? <p className="text-sm text-muted-foreground">{descripcion}</p> : null}
        </div>
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  );
}
