import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import { listarCatalogo } from "@/server/services/catalogo";
import { crearVentaAction } from "@/server/actions/ventas";
import { VentaForm } from "@/components/venta-form";
import { PageHeader } from "@/components/page-header";

export default async function NuevaVentaPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  await requireRole("operador", "admin");

  const { clienteId } = await searchParams;
  const idCliente = Number(clienteId);
  if (!Number.isInteger(idCliente)) notFound();

  const [cliente, catalogo] = await Promise.all([
    obtenerClienteDetalle(idCliente),
    listarCatalogo(),
  ]);
  if (!cliente) notFound();

  return (
    <div>
      <PageHeader titulo={`Nueva venta — ${cliente.nombre}`} />
      <VentaForm
        accion={crearVentaAction}
        idCliente={idCliente}
        catalogo={catalogo}
        textoBoton="Registrar venta"
      />
    </div>
  );
}
