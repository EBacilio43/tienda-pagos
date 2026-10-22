import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import { crearPagoAction } from "@/server/actions/pagos";
import { PagoForm } from "@/components/pago-form";
import { ModalRuta } from "@/components/modal-ruta";

export default async function NuevoPagoModal({
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
    <ModalRuta titulo={`Nuevo pago — ${cliente.nombre}`}>
      <PagoForm accion={crearPagoAction} idCliente={idCliente} textoBoton="Registrar pago" />
    </ModalRuta>
  );
}
