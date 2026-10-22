import { Skeleton } from "@/components/ui/skeleton";

// Fase 9 / ADR-17. Esqueleto con la forma de una página real (título +
// panel con filas) en vez del spinner genérico — evita el salto de layout
// cuando el contenido real llega.
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
