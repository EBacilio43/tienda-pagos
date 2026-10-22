import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaVacia } from "@/components/estado-vacio";
import { Dato } from "@/components/dato";
import { RegistroAuditoria } from "@/components/registro-auditoria";
import { Currency } from "@/components/currency";
import { Fecha } from "@/components/fecha";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableFooter,
} from "@/components/ui/table";
import { obtenerVentaDetalle } from "@/server/services/ventas";
import { leerSesion } from "@/server/auth/session";
import { puedeGestionarTransacciones } from "@/lib/permisos";
import type { Rol } from "@/types/dominio";

export default async function VentaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ventaId = Number(id);
  if (!Number.isInteger(ventaId)) notFound();

  const venta = await obtenerVentaDetalle(ventaId);
  if (!venta) notFound();

  const usuario = await leerSesion();
  const rol = usuario?.rol as Rol | undefined;
  const puedeGestionar = rol ? puedeGestionarTransacciones(rol) : false;

  return (
    <div>
      <PageHeader
        titulo={`Venta #${venta.id}`}
        descripcion={
          <Link href={`/clientes/${venta.clienteId}`} className="hover:underline">
            {venta.clienteNombre}
          </Link>
        }
        acciones={
          puedeGestionar ? (
            <Link href={`/ventas/${venta.id}/editar`} className={buttonVariants({ size: "sm" })}>
              Editar
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Fecha" valor={<Fecha value={venta.fecha} formato="largo" />} />
        <Dato etiqueta="Esquema de pago" valor={venta.esquemaPago ?? "Sin especificar"} />
        {venta.frecuenciaPago ? <Dato etiqueta="Frecuencia" valor={venta.frecuenciaPago} /> : null}
        {venta.tieneEnganche && venta.enganche ? (
          <Dato etiqueta="Enganche" valor={<Currency value={venta.enganche} tono="enganche" />} />
        ) : null}
        <Dato
          etiqueta="Total"
          valor={<Currency value={venta.montoTotal} tono="venta" />}
          destacado
          className="border-venta"
        />
      </div>

      <PanelTabla className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artículo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio unitario</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {venta.articulos.length === 0 ? (
              <FilaVacia colSpan={4}>
                Esta venta se registró solo con su total, sin desglose de piezas.
              </FilaVacia>
            ) : (
              venta.articulos.map((articulo, i) => (
                <TableRow key={i}>
                  <TableCell>{articulo.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{articulo.cantidad}</TableCell>
                  <TableCell className="text-right">
                    <Currency value={articulo.precioUnitario} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Currency value={articulo.subtotal} tono="venta" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right">
                <Currency value={venta.montoTotal} tono="venta" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </PanelTabla>

      <RegistroAuditoria {...venta.registro} />
    </div>
  );
}
