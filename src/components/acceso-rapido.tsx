import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// La fila de accesos rápidos del dashboard. Vive aquí, y no dentro de
// page.tsx como antes, porque `RegistroRapido` —que es "use client"— tiene
// que verse igual: los botones de venta y devolución no navegan a ninguna
// ruta (ambas altas exigen elegir cliente primero), así que abren el diálogo
// en vez de ser enlaces, y sin compartir la clase se irían separando.
export const CLASE_ACCESO_RAPIDO =
  "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent";

export function AccesoRapido({
  href,
  etiqueta,
  icono: Icono,
}: {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
}) {
  return (
    <Link href={href} className={CLASE_ACCESO_RAPIDO}>
      <Icono className="size-4 text-muted-foreground" />
      {etiqueta}
    </Link>
  );
}
