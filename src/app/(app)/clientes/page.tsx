import Link from "next/link";
import { listarClientes, CLIENTES_POR_PAGINA } from "@/server/services/clientes";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { leerSesion } from "@/server/auth/session";
import { puedeCrearEditarClientes } from "@/lib/permisos";
import { ClientesTarjetas } from "@/components/clientes-tarjetas";
import { PageHeader } from "@/components/page-header";
import { Paginacion } from "@/components/paginacion";
import type { Rol } from "@/types/dominio";

function construirHref(pagina: number, busqueda: string) {
  const params = new URLSearchParams();
  if (busqueda) params.set("q", busqueda);
  params.set("pagina", String(pagina));
  return `/clientes?${params.toString()}`;
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const busqueda = params.q ?? "";
  const pagina = Number(params.pagina ?? "1") || 1;

  const [{ clientes, total }, usuario] = await Promise.all([
    listarClientes({ busqueda, pagina }),
    leerSesion(),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(total / CLIENTES_POR_PAGINA));
  const puedeCrear = usuario ? puedeCrearEditarClientes(usuario.rol as Rol) : false;

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        acciones={
          puedeCrear ? (
            <Link href="/clientes/nuevo" className={buttonVariants({ size: "sm" })}>
              Nuevo cliente
            </Link>
          ) : null
        }
        volver={false}
      />

      <form className="mb-4 max-w-sm" action="/clientes" method="get">
        <Input type="search" name="q" placeholder="Buscar por nombre..." defaultValue={busqueda} />
      </form>

      <ClientesTarjetas clientes={clientes} />

      <Paginacion
        pagina={pagina}
        totalPaginas={totalPaginas}
        total={total}
        etiqueta={(n) => `${n} cliente${n === 1 ? "" : "s"}`}
        construirHref={(p) => construirHref(p, busqueda)}
      />
    </div>
  );
}
