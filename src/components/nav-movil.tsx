"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, X, LayoutDashboard, Activity, HandCoins, Users } from "lucide-react";
import { NavLateral } from "@/components/nav-lateral";
import { cn } from "@/lib/utils";
import { APP_CONFIG } from "@/lib/config";

// Fase 9 / ADR-17 / P15.
// Provee la experiencia completa de navegación móvil en pantallas < 768px (sm:hidden):
// 1) Botón de apertura (hamburguesa) en el header superior con zona táctil mínima de 44x44px.
// 2) Drawer lateral completo con NavLateral y PieSidebar accesible con una mano.
// 3) Barra de navegación inferior fija (Bottom Navigation) ergonómica para accesos
//    rápidos a / (Inicio), /actividad, /pagos/lote (Abonos) y /clientes.
//
// `pie` es el mismo <PieSidebar> del escritorio, pasado como ReactNode desde
// el layout: es un Server Component (tres <form> con Server Action y uno
// plano de logout) y por eso NO se puede importar aquí, que es un módulo
// "use client" — cruzar esa frontera al revés lo convertiría en cliente. Va
// por children para que el cajón móvil no se quede sin tema, cuenta ni
// salida ahora que el header de escritorio desapareció.
export function NavMovil({ esAdmin, pie }: { esAdmin: boolean; pie: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();

  function esActivo(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      <Dialog.Root open={abierto} onOpenChange={setAbierto}>
        <Dialog.Trigger
          className="flex size-11 items-center justify-center rounded-md hover:bg-accent sm:hidden -ml-2 text-foreground"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
          <span className="sr-only">Abrir menú</span>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar p-4 text-sidebar-foreground shadow-lg outline-none data-closed:animate-out data-closed:slide-out-to-left data-open:animate-in data-open:slide-in-from-left">
            <div className="mb-6 flex items-center justify-between">
              <Dialog.Title className="font-heading text-lg font-semibold">
                {APP_CONFIG.nombre}
              </Dialog.Title>
              <Dialog.Close
                className="flex size-11 items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground"
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
                <span className="sr-only">Cerrar menú</span>
              </Dialog.Close>
            </div>
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              <NavLateral esAdmin={esAdmin} onNavegar={() => setAbierto(false)} />
            </div>
            {pie}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Barra de navegación inferior móvil ergonómica (Bottom Navigation) */}
      <nav
        aria-label="Navegación móvil inferior"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-border bg-background/95 backdrop-blur px-1 sm:hidden pb-[env(safe-area-inset-bottom)]"
      >
        <Link
          href="/"
          onClick={() => setAbierto(false)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 py-1 min-h-[44px] min-w-[44px] transition-colors",
            esActivo("/")
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutDashboard className="size-5 shrink-0" />
          <span className="text-[11px] leading-tight">Inicio</span>
        </Link>

        <Link
          href="/actividad"
          onClick={() => setAbierto(false)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 py-1 min-h-[44px] min-w-[44px] transition-colors",
            esActivo("/actividad")
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity className="size-5 shrink-0" />
          <span className="text-[11px] leading-tight">Actividad</span>
        </Link>

        <Link
          href="/pagos/lote"
          onClick={() => setAbierto(false)}
          className={cn(
            "group flex flex-1 flex-col items-center justify-center py-1 min-h-[44px] min-w-[44px] transition-transform active:scale-95",
            esActivo("/pagos")
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-colors",
              esActivo("/pagos")
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-primary/10 text-primary group-hover:bg-primary/20"
            )}
          >
            <HandCoins className="size-5" />
          </div>
          <span className="mt-0.5 text-[11px] leading-tight">Abonar</span>
        </Link>

        <Link
          href="/clientes"
          onClick={() => setAbierto(false)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 py-1 min-h-[44px] min-w-[44px] transition-colors",
            esActivo("/clientes")
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="size-5 shrink-0" />
          <span className="text-[11px] leading-tight">Clientes</span>
        </Link>

        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-1 min-h-[44px] min-w-[44px] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Abrir menú"
        >
          <Menu className="size-5 shrink-0" />
          <span className="text-[11px] leading-tight">Menú</span>
        </button>
      </nav>
    </>
  );
}
