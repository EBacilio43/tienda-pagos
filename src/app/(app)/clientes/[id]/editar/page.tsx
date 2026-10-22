import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import { actualizarClienteAction } from "@/server/actions/clientes";
import { ClienteForm } from "@/components/cliente-form";
import { PageHeader } from "@/components/page-header";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("operador", "admin");

  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId)) notFound();

  const cliente = await obtenerClienteDetalle(clienteId);
  if (!cliente) notFound();

  const accion = actualizarClienteAction.bind(null, clienteId);

  return (
    <div>
      <PageHeader titulo={`Editar cliente: ${cliente.nombre}`} />
      <ClienteForm accion={accion} valoresIniciales={cliente} textoBoton="Guardar cambios" />
    </div>
  );
}
