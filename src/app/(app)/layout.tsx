import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/server/auth/guards";
import { puedeGestionarUsuarios } from "@/lib/permisos";
import { NavLateral } from "@/components/nav-lateral";
import { NavMovil } from "@/components/nav-movil";
import { PieSidebar } from "@/components/pie-sidebar";
import { COOKIE_TEMA, type Tema } from "@/lib/tema";
import { APP_CONFIG } from "@/lib/config";
import type { Rol } from "@/types/dominio";

// `modal` es un slot de rutas paralelas (@modal) — lo llena una ruta
// interceptada cuando se navega con <Link> a un formulario corto, y queda
// en null (@modal/default.tsx) en cualquier otro caso. Ver
// components/modal-ruta.tsx y docs/PLAN.md.
export default async function AppLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  const usuario = await requireUser();
  const esAdmin = puedeGestionarUsuarios(usuario.rol as Rol);
  const tema = ((await cookies()).get(COOKIE_TEMA)?.value ?? "sistema") as Tema;

  const pie = (
    <PieSidebar tema={tema} nombreCompleto={usuario.nombreCompleto} rol={usuario.rol} />
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar estático: `sticky top-0` + `h-svh` + `self-start` lo dejan
          fijo mientras la única cosa que se desplaza es el contenido. Antes
          era un elemento normal de la fila flex, así que en una tabla larga
          (catálogo, ledger de un cliente) la navegación se iba hacia arriba
          con la página y había que volver al tope para cambiar de pantalla.
          `self-start` es lo que evita que el `stretch` por defecto del flex
          le imponga la altura de la fila y anule el sticky. */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col self-start bg-sidebar p-4 text-sidebar-foreground sm:flex">
        <div className="mb-6 px-1 font-heading text-lg font-semibold">{APP_CONFIG.nombre}</div>

        {/* min-h-0 es obligatorio para que este hijo pueda encogerse por
            debajo de su contenido y activar su propio scroll; sin él, una
            navegación más larga que la pantalla empujaría el pie fuera de
            la vista, que es justo lo que no puede pasar. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <NavLateral esAdmin={esAdmin} />
        </div>

        {pie}
      </aside>

      {/* min-w-0: sin esto, un hijo de un flex row (esta columna) no se
          deja encoger por debajo del ancho natural de su contenido — una
          tabla ancha (catálogo, ledger del cliente) empuja TODA la página
          más allá del viewport en vez de activar su propio scroll
          horizontal (que Table ya trae, components/ui/table.tsx). */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Solo móvil. En escritorio el header se quedó vacío al mudarse el
            bloque de cuenta al pie del sidebar, y una franja vacía con
            borde no es neutral: robaba altura a cada pantalla. El título de
            cada página ya lo pone `PageHeader`. */}
        {/* sticky: en una tabla larga vista desde el teléfono, el único
            acceso a la navegación es este botón — sin sticky había que
            volver hasta arriba del ledger para poder cambiar de pantalla,
            que es justo lo que el sidebar de escritorio ya no hace. */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background px-4 py-3 sm:hidden">
          <NavMovil esAdmin={esAdmin} pie={pie} />
          <span className="font-heading font-semibold">{APP_CONFIG.nombre}</span>
        </header>
        {/* p-4 en móvil: los 24 px de p-6 se comen 48 de los 360 del
            teléfono más angosto que se usa hoy, y esos 48 px son la
            diferencia entre que una tarjeta de resumen quepa o no.
            pb-24 en móvil: asegura que la barra inferior ergonómica (h-16
            + safe-area) no tape el final de tablas, botones ni tarjetas. */}
        <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-6">{children}</main>
        {modal}
      </div>
    </div>
  );
}
