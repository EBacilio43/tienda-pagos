import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Currency } from "@/components/currency";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaVacia, EstadoVacio } from "@/components/estado-vacio";
import { FilaActividad } from "@/components/fila-actividad";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { hrefDetalleMovimiento } from "@/lib/movimientos";
import type { ActividadItemDTO } from "@/types/dominio";

// El feed de movimientos, con sus dos presentaciones. Existe porque
// /actividad y el panel del dashboard pintaban la misma lista con dos
// copias del mismo diccionario de etiquetas, la misma tabla y la misma
// función de enlace — y solo se diferencian en si muestran la columna de
// detalle. Dos copias divergen; la que se rompe primero es la que se mira
// menos.

const TIPO_ETIQUETA: Record<string, string> = {
  venta: "Venta",
  enganche: "Enganche",
  pago: "Abono",
  devolucion: "Devolución",
};

const TIPO_VARIANTE: Record<string, "venta" | "enganche" | "abono" | "devolucion"> = {
  venta: "venta",
  enganche: "enganche",
  pago: "abono",
  devolucion: "devolucion",
};

export function ListaActividad({
  items,
  vacio,
  mostrarDetalle = false,
}: {
  items: ActividadItemDTO[];
  vacio: string;
  /** El dashboard no lo muestra: ahí el panel es un resumen, no la lista. */
  mostrarDetalle?: boolean;
}) {
  return (
    <>
      {/* `fechaTexto` trae fecha y hora en una sola cadena ("10/05/2026,
          04:57 p.m."): ~150 px que no se pueden partir, y con tipo, cliente
          y monto al lado la tabla pedía ~500 px contra los 328 del
          teléfono. Debajo de `md`, una tarjeta por movimiento — y ahí la
          fecha cabe entera porque tiene su propio renglón. */}
      <div className="flex flex-col gap-2 md:hidden">
        {items.length === 0 ? (
          <EstadoVacio titulo={vacio} />
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={hrefDetalleMovimiento(item.id, item.tipo)}
              className="block rounded-xl border bg-card p-3 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant={TIPO_VARIANTE[item.tipo] ?? "outline"}>
                  {TIPO_ETIQUETA[item.tipo]}
                </Badge>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {item.fechaTexto}
                </span>
              </div>

              <div className="mt-2 flex items-baseline justify-between gap-3">
                {/* El nombre del cliente NO es un <a> anidado aquí, a
                    diferencia de la tabla: la tarjeta entera ya es un
                    enlace, y anidar uno dentro de otro es HTML inválido. Se
                    llega a la ficha del cliente desde el detalle. */}
                <span className="min-w-0 flex-1 font-medium break-words">
                  {item.clienteNombre}
                </span>
                <span className="shrink-0 font-semibold">
                  <Currency value={item.monto} tono={TIPO_VARIANTE[item.tipo] ?? "neutro"} />
                </span>
              </div>

              {mostrarDetalle && item.detalle ? (
                <p className="mt-1 text-xs break-words text-muted-foreground">{item.detalle}</p>
              ) : null}
            </Link>
          ))
        )}
      </div>

      <PanelTabla className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cliente</TableHead>
              {mostrarDetalle ? <TableHead>Detalle</TableHead> : null}
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <FilaVacia colSpan={mostrarDetalle ? 5 : 4}>{vacio}</FilaVacia>
            ) : (
              items.map((item) => (
                <FilaActividad key={item.id} href={hrefDetalleMovimiento(item.id, item.tipo)}>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {item.fechaTexto}
                  </TableCell>
                  <TableCell>
                    <Badge variant={TIPO_VARIANTE[item.tipo] ?? "outline"}>
                      {TIPO_ETIQUETA[item.tipo]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/clientes/${item.clienteId}`} className="hover:underline">
                      {item.clienteNombre}
                    </Link>
                  </TableCell>
                  {mostrarDetalle ? <TableCell>{item.detalle ?? "—"}</TableCell> : null}
                  <TableCell className="text-right">
                    <Currency value={item.monto} tono={TIPO_VARIANTE[item.tipo] ?? "neutro"} />
                  </TableCell>
                </FilaActividad>
              ))
            )}
          </TableBody>
        </Table>
      </PanelTabla>
    </>
  );
}
