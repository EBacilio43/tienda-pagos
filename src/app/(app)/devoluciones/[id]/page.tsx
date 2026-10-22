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
import { obtenerDevolucionDetalle } from "@/server/services/devoluciones";
import { leerSesion } from "@/server/auth/session";
import { puedeGestionarTransacciones } from "@/lib/permisos";
import type { Rol } from "@/types/dominio";

export default async function DevolucionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const devolucionId = Number(id);
  if (!Number.isInteger(devolucionId)) notFound();

  const devolucion = await obtenerDevolucionDetalle(devolucionId);
  if (!devolucion) notFound();

  const usuario = await leerSesion();
  const rol = usuario?.rol as Rol | undefined;
  const puedeGestionar = rol ? puedeGestionarTransacciones(rol) : false;

  return (
    <div>
      <PageHeader
        titulo={`Devolución #${devolucion.id}`}
        descripcion={
          <Link href={`/clientes/${devolucion.clienteId}`} className="hover:underline">
            {devolucion.clienteNombre}
          </Link>
        }
        acciones={
          puedeGestionar ? (
            <Link
              href={`/devoluciones/${devolucion.id}/editar`}
              className={buttonVariants({ size: "sm" })}
            >
              Editar
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Fecha" valor={<Fecha value={devolucion.fecha} formato="largo" />} />
        <Dato etiqueta="Motivo" valor={devolucion.motivo ?? "Sin especificar"} />
        <Dato
          etiqueta="Crédito"
          valor={<Currency value={devolucion.montoCredito} tono="devolucion" />}
          destacado
          className="border-devolucion"
        />
      </div>

      <PanelTabla className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artículo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio de venta</TableHead>
              <TableHead className="text-right">Se acredita c/u</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devolucion.articulos.length === 0 ? (
              <FilaVacia colSpan={5}>
                Esta devolución se registró solo con su monto, sin desglose de piezas.
              </FilaVacia>
            ) : (
              devolucion.articulos.map((articulo, i) => (
                <TableRow key={i}>
                  <TableCell>{articulo.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{articulo.cantidad}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <Currency value={articulo.precioUnitario} tono="neutro" />
                  </TableCell>
                  {/* Las dos columnas están porque la diferencia entre ellas
                      es justo lo que hay que poder explicarle al cliente: la
                      pieza volvió con desgaste y se le reconoció menos. */}
                  <TableCell className="text-right">
                    <Currency value={articulo.precioCredito ?? articulo.precioUnitario} />
                    {articulo.precioCredito !== null ? (
                      <span className="ml-1 text-xs text-muted-foreground">ajustado</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Currency value={articulo.subtotal} tono="devolucion" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Total</TableCell>
              <TableCell className="text-right">
                <Currency value={devolucion.montoCredito} tono="devolucion" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </PanelTabla>

      <RegistroAuditoria {...devolucion.registro} />
    </div>
  );
}
