"use client";

import { useEffect, useState, useTransition } from "react";
import {
  guardarCatalogoEnLoteAction,
  eliminarArticuloAction,
  ajustarStockAction,
} from "@/server/actions/catalogo";
import type { CatalogoItemDTO } from "@/types/dominio";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BotonConfirmarAccion } from "@/components/boton-confirmar-accion";
import { Label } from "@/components/ui/label";
import { Campo } from "@/components/campo";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaVacia, EstadoVacio } from "@/components/estado-vacio";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

export function CatalogoGrid({ itemsIniciales }: { itemsIniciales: CatalogoItemDTO[] }) {
  const [filas, setFilas] = useState<CatalogoItemDTO[]>(itemsIniciales);
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    setFilas(itemsIniciales);
  }, [itemsIniciales]);

  function actualizarCampo<K extends keyof CatalogoItemDTO>(
    id: number,
    campo: K,
    valor: CatalogoItemDTO[K]
  ) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function guardar() {
    setMensaje(null);
    iniciarTransicion(async () => {
      const resultado = await guardarCatalogoEnLoteAction(
        filas.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          precio: f.precio,
          descripcion: f.descripcion ?? undefined,
          activo: f.activo,
          stockMinimo: f.stockMinimo,
        }))
      );
      setMensaje(resultado.ok ? "Cambios guardados." : resultado.mensaje);
    });
  }

  function quitarFila(id: number) {
    setFilas((prev) => prev.filter((x) => x.id !== id));
  }

  function ajustar(id: number, delta: number) {
    setMensaje(null);
    iniciarTransicion(async () => {
      const resultado = await ajustarStockAction(id, delta, "Ajuste desde catálogo");
      if (resultado.ok) {
        setFilas((prev) =>
          prev.map((f) => (f.id === id ? { ...f, stock: f.stock + delta } : f))
        );
      } else {
        setMensaje(resultado.mensaje);
      }
    });
  }

  return (
    <div>
      {/* Mismo criterio que <CapturaAbonos>: seis columnas de controles
          piden ~600 px, y por debajo de eso editar significa hacer scroll
          horizontal mientras se teclea. Debajo de `lg` cada artículo es una
          tarjeta; los controles salen de los mismos helpers, así que las
          dos presentaciones no pueden divergir. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {filas.length === 0 ? (
          <EstadoVacio titulo="Sin artículos en el catálogo" />
        ) : (
          filas.map((f) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3">
              <Campo id={`nombre-movil-${f.id}`} label="Artículo">
                <CampoNombre id={`nombre-movil-${f.id}`} fila={f} actualizar={actualizarCampo} />
              </Campo>

              <div className="grid grid-cols-2 gap-2">
                <Campo id={`precio-movil-${f.id}`} label="Precio">
                  <CampoPrecio id={`precio-movil-${f.id}`} fila={f} actualizar={actualizarCampo} />
                </Campo>
                <Campo id={`minimo-movil-${f.id}`} label="Mínimo">
                  <CampoMinimo id={`minimo-movil-${f.id}`} fila={f} actualizar={actualizarCampo} />
                </Campo>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">
                    Stock
                  </span>
                  <ControlStock fila={f} pendiente={pendiente} ajustar={ajustar} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`activo-movil-${f.id}`}
                    checked={f.activo}
                    onCheckedChange={(checked) => actualizarCampo(f.id, "activo", checked)}
                  />
                  <Label htmlFor={`activo-movil-${f.id}`}>Activo</Label>
                </div>
                <BotonEliminar fila={f} onEliminado={quitarFila} />
              </div>
            </div>
          ))
        )}
      </div>

      <PanelTabla className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artículo</TableHead>
              <TableHead className="w-28">Precio</TableHead>
              <TableHead className="w-20">Mínimo</TableHead>
              <TableHead className="w-36">Stock</TableHead>
              <TableHead className="w-16">Activo</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 ? (
              <FilaVacia colSpan={6}>Sin artículos en el catálogo</FilaVacia>
            ) : (
              filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <CampoNombre fila={f} actualizar={actualizarCampo} />
                  </TableCell>
                  <TableCell>
                    <CampoPrecio fila={f} actualizar={actualizarCampo} />
                  </TableCell>
                  <TableCell>
                    <CampoMinimo fila={f} actualizar={actualizarCampo} />
                  </TableCell>
                  <TableCell>
                    <ControlStock fila={f} pendiente={pendiente} ajustar={ajustar} />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={f.activo}
                      onCheckedChange={(checked) => actualizarCampo(f.id, "activo", checked)}
                      aria-label={`Activar "${f.nombre}"`}
                    />
                  </TableCell>
                  <TableCell>
                    <BotonEliminar fila={f} onEliminado={quitarFila} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </PanelTabla>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={guardar} disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </Button>
        {mensaje ? <p className="text-sm text-muted-foreground">{mensaje}</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Controles compartidos por la tabla (lg+) y las tarjetas (móvil), por el
// mismo motivo que en <CapturaAbonos>: dos copias del mismo control se
// separan en el primer cambio, y la que se rompe es la que nadie mira.
// ---------------------------------------------------------------------

type Actualizar = <K extends keyof CatalogoItemDTO>(
  id: number,
  campo: K,
  valor: CatalogoItemDTO[K]
) => void;

type PropsCampo = { fila: CatalogoItemDTO; actualizar: Actualizar; id?: string };

function CampoNombre({ fila, actualizar, id }: PropsCampo) {
  return (
    <Input
      id={id}
      value={fila.nombre}
      onChange={(e) => actualizar(fila.id, "nombre", e.target.value)}
      aria-label={id ? undefined : "Nombre del artículo"}
    />
  );
}

function CampoPrecio({ fila, actualizar, id }: PropsCampo) {
  return (
    <Input
      id={id}
      value={fila.precio}
      onChange={(e) => actualizar(fila.id, "precio", e.target.value)}
      inputMode="decimal"
      className="text-right tabular-nums"
      aria-label={id ? undefined : `Precio de "${fila.nombre}"`}
    />
  );
}

function CampoMinimo({ fila, actualizar, id }: PropsCampo) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      value={fila.stockMinimo}
      onChange={(e) => actualizar(fila.id, "stockMinimo", Number(e.target.value))}
      aria-label={id ? undefined : `Stock mínimo de "${fila.nombre}"`}
    />
  );
}

function ControlStock({
  fila,
  pendiente,
  ajustar,
}: {
  fila: CatalogoItemDTO;
  pendiente: boolean;
  ajustar: (id: number, delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => ajustar(fila.id, -1)}
        disabled={pendiente || fila.stock <= 0}
        aria-label={`Bajar una unidad de "${fila.nombre}"`}
      >
        −
      </Button>
      <span className="w-8 text-center tabular-nums">{fila.stock}</span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => ajustar(fila.id, 1)}
        disabled={pendiente}
        aria-label={`Subir una unidad de "${fila.nombre}"`}
      >
        +
      </Button>
    </div>
  );
}

function BotonEliminar({
  fila,
  onEliminado,
}: {
  fila: CatalogoItemDTO;
  onEliminado: (id: number) => void;
}) {
  return (
    <BotonConfirmarAccion
      etiqueta="Eliminar"
      etiquetaPendiente="Eliminando…"
      titulo={`Eliminar "${fila.nombre}"`}
      descripcion="Esta acción no se puede deshacer."
      accion={async () => {
        const resultado = await eliminarArticuloAction(fila.id);
        if (resultado.ok) onEliminado(fila.id);
        return resultado;
      }}
    />
  );
}
