import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerClienteDetalle } from "@/server/services/clientes";
import {
  obtenerDevolucionParaEditar,
  obtenerArticulosDevolubles,
} from "@/server/services/devoluciones";
import { actualizarDevolucionAction } from "@/server/actions/devoluciones";
import { DevolucionForm } from "@/components/devolucion-form";
import { PageHeader } from "@/components/page-header";
import { claveArticulo } from "@/lib/articulos";

export default async function EditarDevolucionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("operador", "admin");

  const { id } = await params;
  const devolucionId = Number(id);
  if (!Number.isInteger(devolucionId)) notFound();

  const devolucion = await obtenerDevolucionParaEditar(devolucionId);
  if (!devolucion) notFound();

  const [cliente, devolublesBase] = await Promise.all([
    obtenerClienteDetalle(devolucion.idCliente),
    obtenerArticulosDevolubles(devolucion.idCliente),
  ]);
  if (!cliente) notFound();

  // Los artículos ya incluidos en esta devolución no aparecen en
  // obtenerArticulosDevolubles (se excluyen de "ya devuelto" del lado del
  // servidor al validar, pero acá solo mostramos la disponibilidad
  // "cruda" — le sumamos de vuelta lo que esta misma devolución ya tiene,
  // para que el operador vea el máximo real al editar).
  const devolubles = [...devolublesBase];
  for (const articulo of devolucion.articulos) {
    const clave = claveArticulo(articulo);
    const existente = devolubles.find((d) => d.clave === clave);
    if (existente) {
      existente.cantidadDisponible += articulo.cantidad;
    } else {
      devolubles.push({
        clave,
        idCatalogo: articulo.idCatalogo,
        nombre: articulo.nombre,
        precioUnitario: articulo.precioUnitario,
        cantidadDisponible: articulo.cantidad,
      });
    }
  }

  const accion = actualizarDevolucionAction.bind(null, devolucionId);

  return (
    <div>
      <PageHeader titulo={`Editar devolución — ${cliente.nombre}`} />
      <DevolucionForm
        accion={accion}
        idCliente={devolucion.idCliente}
        devolubles={devolubles}
        valoresIniciales={{
          fecha: devolucion.fecha,
          motivo: devolucion.motivo,
          articulos: devolucion.articulos,
        }}
        textoBoton="Guardar cambios"
      />
    </div>
  );
}
