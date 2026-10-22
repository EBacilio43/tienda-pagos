"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

// docs/PLAN.md: "Modales solo como rutas interceptadas (@modal + (.)) para
// formularios cortos: navegación suave = modal, link directo = página
// completa." Este es el envoltorio que usan esas rutas interceptadas.
//
// No contradice ADR-05 (que rechazó los diálogos apilados de NiceGUI): la
// URL sigue siendo real y deep-linkable. Lo que cambia es solo la
// PRESENTACIÓN según cómo llegaste — llegando con <Link> desde /clientes,
// Next intercepta la ruta y la pinta aquí; entrando directo, recargando o
// compartiendo el enlace, se renderiza la página completa de siempre.
//
// `open` es siempre true a propósito: el modal existe porque la ruta
// interceptada se está renderizando, así que cerrarlo NO es cambiar estado
// local sino navegar hacia atrás — router.back() deshace exactamente la
// navegación que lo abrió, y con eso Esc, el botón de atrás del navegador y
// el clic en el fondo terminan haciendo todos lo mismo.
export function ModalRuta({ titulo, children }: { titulo: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <Dialog.Root open onOpenChange={(abierto) => { if (!abierto) router.back(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border bg-card p-4 sm:p-6 text-card-foreground shadow-lg outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
          <div className="mb-4 flex items-start justify-between gap-3">
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {titulo}
            </Dialog.Title>
            <Dialog.Close className="flex size-11 sm:size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground touch-manipulation">
              <X className="size-5" />
              <span className="sr-only">Cerrar</span>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
