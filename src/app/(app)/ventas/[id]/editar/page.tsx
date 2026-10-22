import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import { listarCatalogo } from "@/server/services/catalogo";
import { obtenerVentaParaEditar } from "@/server/services/ventas";
import { actualizarVentaAction } from "@/server/actions/ventas";
import { VentaForm } from "@/components/venta-form";
import { PageHeader } from "@/components/page-header";

export default async function EditarVentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("operador", "admin");

  const { id } = await params;
  const ventaId = Number(id);
  if (!Number.isInteger(ventaId)) notFound();

  const venta = await obtenerVentaParaEditar(ventaId);
  if (!venta) notFound();

  const [cliente, catalogo] = await Promise.all([
    obtenerClienteDetalle(venta.idCliente),
    listarCatalogo(),
  ]);
  if (!cliente) notFound();

  const accion = actualizarVentaAction.bind(null, ventaId);

  return (
    <div>
      <PageHeader titulo={`Editar venta — ${cliente.nombre}`} />
      <VentaForm
        accion={accion}
        idCliente={venta.idCliente}
        catalogo={catalogo}
        valoresIniciales={{
          fecha: venta.fecha,
          esquemaPago: venta.esquemaPago ?? "Contado",
          frecuenciaPago: venta.frecuenciaPago ?? undefined,
          tieneEnganche: venta.tieneEnganche,
          enganche: venta.enganche ?? undefined,
          articulos: venta.articulos,
        }}
        textoBoton="Guardar cambios"
      />
    </div>
  );
}
