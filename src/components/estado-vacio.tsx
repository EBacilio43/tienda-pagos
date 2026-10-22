import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TableRow, TableCell } from "@/components/ui/table";

// Fase 9 / ADR-17. `FilaVacia` reemplaza la fila "colSpan + texto" que 6
// tablas repetían con 6 textos distintos (y que catalogo-grid.tsx no tenía
// en absoluto). `EstadoVacio` reemplaza los 4 párrafos sueltos de
// clientes/[id] y los 2 de los formularios de venta/devolución.
export function FilaVacia({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  icono,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  accion?: ReactNode;
  icono?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center",
        className
      )}
    >
      {icono ? <div className="text-muted-foreground">{icono}</div> : null}
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {descripcion ? (
        <p className="max-w-sm text-sm text-muted-foreground">{descripcion}</p>
      ) : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
