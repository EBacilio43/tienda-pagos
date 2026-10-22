import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// Fase 9 / ADR-17. Reemplaza los ~30 renglones duplicados verbatim en
// clientes/page.tsx y admin/auditoria/page.tsx. Cada página conserva su
// propio construirHref — es lo único que realmente difiere entre las dos.
export function Paginacion({
  pagina,
  totalPaginas,
  total,
  etiqueta,
  construirHref,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  etiqueta: (total: number) => string;
  construirHref: (pagina: number) => string;
}) {
  return (
    // flex-wrap + gap: en 360 px, "110 registros" más los dos botones y el
    // contador de páginas suman más ancho del que hay, y sin wrap el bloque
    // se salía del viewport en vez de partirse en dos renglones.
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span>{etiqueta(total)}</span>
      <div className="flex flex-wrap items-center gap-2">
        {pagina > 1 ? (
          <Link
            href={construirHref(pagina - 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft />
            Anterior
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft />
            Anterior
          </Button>
        )}
        <span className="whitespace-nowrap">
          Página {pagina} de {totalPaginas}
        </span>
        {pagina < totalPaginas ? (
          <Link
            href={construirHref(pagina + 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Siguiente
            <ChevronRight />
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Siguiente
            <ChevronRight />
          </Button>
        )}
      </div>
    </div>
  );
}
