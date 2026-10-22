// Fuente única de la clase de una fila del sidebar. La usan `nav-lateral.tsx`
// (los links de navegación) y `pie-sidebar.tsx` (mi cuenta y salir) — mismo
// motivo que `control.ts`: si cada uno la escribe por su lado, divergen, y
// el pie es justo donde se nota, porque queda pegado a la última fila de la
// navegación.
export const claseFilaSidebar =
  "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px] sm:min-h-0";


// Estado inactivo — el activo lo agrega nav-lateral, que es el único que
// sabe cuál ruta está abierta.
export const claseFilaSidebarInactiva =
  "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
