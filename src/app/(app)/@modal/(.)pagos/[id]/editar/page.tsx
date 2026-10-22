import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import { obtenerPagoParaEditar } from "@/server/services/pagos";
import { actualizarPagoAction } from "@/server/actions/pagos";
import { PagoForm } from "@/components/pago-form";
import { ModalRuta } from "@/components/modal-ruta";

export default async function EditarPagoModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("operador", "admin");

  const { id } = await params;
  const pagoId = Number(id);
  if (!Number.isInteger(pagoId)) notFound();

  const pago = await obtenerPagoParaEditar(pagoId);
  if (!pago) notFound();

  const cliente = await obtenerClienteDetalle(pago.idCliente);
  if (!cliente) notFound();

  return (
    <ModalRuta titulo={`Editar pago — ${cliente.nombre}`}>
      <PagoForm
        accion={actualizarPagoAction.bind(null, pagoId)}
        idCliente={pago.idCliente}
        valoresIniciales={pago}
        textoBoton="Guardar cambios"
      />
    </ModalRuta>
  );
}
