import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import { crearPagoAction } from "@/server/actions/pagos";
import { PagoForm } from "@/components/pago-form";
import { PageHeader } from "@/components/page-header";

export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  await requireRole("operador", "admin");

  const { clienteId } = await searchParams;
  const idCliente = Number(clienteId);
  if (!Number.isInteger(idCliente)) notFound();

  const cliente = await obtenerClienteDetalle(idCliente);
  if (!cliente) notFound();

  return (
    <div>
      <PageHeader titulo={`Nuevo pago — ${cliente.nombre}`} />
      <PagoForm accion={crearPagoAction} idCliente={idCliente} textoBoton="Registrar pago" />
    </div>
  );
}
