"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// router.back() es navegación del lado del cliente (App Router) — a
// diferencia de <a href={document.referrer}> o window.history.back() a
// mano, reutiliza el Router Cache de Next en vez de forzar un roundtrip
// nuevo al servidor. Si no hay historial en esta pestaña, es un no-op
// seguro (nunca navega a algo inesperado).
export function BotonVolver() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Volver"
      className="flex size-11 sm:size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground touch-manipulation"
    >
      <ChevronLeft className="size-5" />
    </button>
  );
}
