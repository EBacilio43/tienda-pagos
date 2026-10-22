"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Users,
  Boxes,
  Package,
  UserCog,
  ScrollText,
  MonitorSmartphone,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { claseFilaSidebar, claseFilaSidebarInactiva } from "@/components/ui/fila-sidebar";

const NAV = [
  { href: "/", etiqueta: "Dashboard", Icono: LayoutDashboard },
  { href: "/actividad", etiqueta: "Actividad", Icono: Activity },
  { href: "/clientes", etiqueta: "Clientes", Icono: Users },
  { href: "/inventario", etiqueta: "Inventario", Icono: Boxes },
  { href: "/catalogo", etiqueta: "Catálogo", Icono: Package },
] as const;

const NAV_ADMIN = [
  { href: "/admin/usuarios", etiqueta: "Usuarios", Icono: UserCog },
  { href: "/admin/auditoria", etiqueta: "Auditoría", Icono: ScrollText },
  { href: "/admin/sesiones", etiqueta: "Sesiones", Icono: MonitorSmartphone },
  { href: "/admin/sistema", etiqueta: "Sistema", Icono: Server },
] as const;

// Fase 9 / ADR-17. Client Component a propósito, no negociable: el App
// Router no vuelve a renderizar un layout compartido al navegar entre
// rutas que lo comparten, así que un estado activo calculado en el
// servidor quedaría congelado en la primera ruta visitada. usePathname()
// es la única forma correcta de saber cuál link está activo.
export function NavLateral({
  esAdmin,
  onNavegar,
}: {
  esAdmin: boolean;
  onNavegar?: () => void;
}) {
  const pathname = usePathname();

  function esActivo(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  function claseItem(href: string) {
    return cn(
      claseFilaSidebar,
      esActivo(href)
        ? "bg-sidebar-primary text-sidebar-primary-foreground before:absolute before:inset-y-1 before:-left-2 before:w-0.5 before:rounded-full before:bg-sidebar-primary-foreground"
        : claseFilaSidebarInactiva
    );
  }

  return (
    <>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, etiqueta, Icono }) => (
          <Link key={href} href={href} onClick={onNavegar} className={claseItem(href)}>
            <Icono className="size-4 shrink-0" />
            {etiqueta}
          </Link>
        ))}
      </nav>

      {esAdmin ? (
        <>
          <div className="mt-6 mb-1 px-3 text-xs font-medium tracking-wide text-sidebar-foreground/50 uppercase">
            Administración
          </div>
          <nav className="flex flex-col gap-1">
            {NAV_ADMIN.map(({ href, etiqueta, Icono }) => (
              <Link key={href} href={href} onClick={onNavegar} className={claseItem(href)}>
                <Icono className="size-4 shrink-0" />
                {etiqueta}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </>
  );
}
