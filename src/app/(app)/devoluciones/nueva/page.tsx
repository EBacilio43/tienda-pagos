import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import { obtenerArticulosDevolubles } from "@/server/services/devoluciones";
import { crearDevolucionAction } from "@/server/actions/devoluciones";
import { DevolucionForm } from "@/components/devolucion-form";
import { PageHeader } from "@/components/page-header";

export default async function NuevaDevolucionPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  await requireRole("operador", "admin");

  const { clienteId } = await searchParams;
  const idCliente = Number(clienteId);
  if (!Number.isInteger(idCliente)) notFound();

  const [cliente, devolubles] = await Promise.all([
    obtenerClienteDetalle(idCliente),
    obtenerArticulosDevolubles(idCliente),
  ]);
  if (!cliente) notFound();

  return (
    <div>
      <PageHeader titulo={`Nueva devolución — ${cliente.nombre}`} />
      <DevolucionForm
        accion={crearDevolucionAction}
        idCliente={idCliente}
        devolubles={devolubles}
        textoBoton="Registrar devolución"
      />
    </div>
  );
}
