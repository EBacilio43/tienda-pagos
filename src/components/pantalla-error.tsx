import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Fase 9 / ADR-17. src/app/error.tsx y src/app/(app)/error.tsx eran
// casi byte-idénticos — Next exige un archivo por segmento (no se pueden
// fusionar), así que esto es lo único que sí se puede compartir.
export function PantallaError({ reset, alto = "min-h-[60vh]" }: { reset: () => void; alto?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 p-4 text-center", alto)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <CircleAlert className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Algo salió mal</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Ocurrió un error inesperado. Puedes intentar de nuevo — si el problema sigue, contacta al
          administrador.
        </p>
      </div>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  );
}
