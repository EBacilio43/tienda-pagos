"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import type { ResultadoAccion } from "@/server/actions/ventas";
import type { CatalogoItemDTO } from "@/types/dominio";
import { generarTokenIdempotencia } from "@/lib/idempotencia";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Campo, CampoTexto } from "@/components/campo";
import { EstadoVacio } from "@/components/estado-vacio";
import { Currency } from "@/components/currency";
import { sumarMontos, multiplicarMonto, REGEX_MONTO_POSITIVO } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CampoFecha } from "@/components/campo-fecha";

type Accion = (prevState: unknown, formData: FormData) => Promise<ResultadoAccion>;

type LineaVenta = {
  idCatalogo: number | null;
  nombre: string;
  cantidad: number;
  precioUnitario: string;
};

const ESTADO_INICIAL: ResultadoAccion = { ok: true };

export function VentaForm({
  accion,
  idCliente,
  catalogo,
  valoresIniciales,
  textoBoton,
}: {
  accion: Accion;
  idCliente: number;
  catalogo: CatalogoItemDTO[];
  valoresIniciales?: {
    fecha?: string;
    esquemaPago?: string;
    frecuenciaPago?: string;
    tieneEnganche?: boolean;
    enganche?: string;
    articulos?: LineaVenta[];
  };
  textoBoton: string;
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [idempotencyToken] = useState(() => generarTokenIdempotencia());

  useEffect(() => {
    if (!pendiente) {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [pendiente]);

  function manejarSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (submittingRef.current || pendiente) {
      e.preventDefault();
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
  }

  const [articulos, setArticulos] = useState<LineaVenta[]>(valoresIniciales?.articulos ?? []);
  const [seleccionId, setSeleccionId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [tieneEnganche, setTieneEnganche] = useState(valoresIniciales?.tieneEnganche ?? false);
  const [esquemaPago, setEsquemaPago] = useState(valoresIniciales?.esquemaPago ?? "Contado");

  // Artículo "libre" — pieza sin vínculo al catálogo, capturada
  // a mano (nombre + precio). El catálogo es un atajo opcional, no un requisito.
  const [nombreLibre, setNombreLibre] = useState("");
  const [precioLibre, setPrecioLibre] = useState("");
  const [cantidadLibre, setCantidadLibre] = useState("1");
  const [errorLibre, setErrorLibre] = useState<string | null>(null);

  const catalogoActivo = catalogo.filter((c) => c.activo);

  function agregarArticulo() {
    const item = catalogoActivo.find((c) => String(c.id) === seleccionId);
    const qty = Number.parseInt(cantidad, 10);
    if (!item || !Number.isInteger(qty) || qty <= 0) return;
    setArticulos((prev) => {
      const existente = prev.find((a) => a.idCatalogo === item.id);
      if (existente) {
        return prev.map((a) =>
          a.idCatalogo === item.id ? { ...a, cantidad: a.cantidad + qty } : a
        );
      }
      return [
        ...prev,
        { idCatalogo: item.id, nombre: item.nombre, cantidad: qty, precioUnitario: item.precio },
      ];
    });
    setSeleccionId("");
    setCantidad("1");
  }

  // Sin merge por nombre a propósito: dos piezas "libres" con el mismo
  // nombre casi siempre son piezas distintas (joyería única), a diferencia
  // de un artículo de catálogo (que sí es el mismo artículo por id).
  function agregarArticuloLibre() {
    setErrorLibre(null);
    const nombre = nombreLibre.trim();
    const precio = precioLibre.trim();
    const qty = Number.parseInt(cantidadLibre, 10);
    if (!nombre) {
      setErrorLibre("Escribe el nombre del artículo.");
      return;
    }
    if (!REGEX_MONTO_POSITIVO.test(precio)) {
      setErrorLibre("Precio inválido.");
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setErrorLibre("Cantidad inválida.");
      return;
    }
    setArticulos((prev) => [...prev, { idCatalogo: null, nombre, cantidad: qty, precioUnitario: precio }]);
    setNombreLibre("");
    setPrecioLibre("");
    setCantidadLibre("1");
  }

  function quitarArticulo(index: number) {
    setArticulos((prev) => prev.filter((_, i) => i !== index));
  }

  const total =
    articulos.length > 0
      ? sumarMontos(...articulos.map((a) => multiplicarMonto(a.precioUnitario, a.cantidad)))
      : "0.00";

  return (
    <form action={ejecutar} onSubmit={manejarSubmit} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="idCliente" value={idCliente} />
      <input type="hidden" name="idempotencyToken" value={idempotencyToken} />
      <input type="hidden" name="articulosJson" value={JSON.stringify(articulos)} />

      {/* Ver pago-form: el input[type=date] no cabe a media pantalla. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoFecha defaultValue={valoresIniciales?.fecha} required />
        <Campo id="esquemaPago" label="Esquema de pago">
          <Select
            id="esquemaPago"
            name="esquemaPago"
            value={esquemaPago}
            onChange={(e) => setEsquemaPago(e.target.value)}
          >
            <option value="Contado">Contado</option>
            <option value="Pagos">Pagos</option>
          </Select>
        </Campo>
      </div>

      {esquemaPago === "Pagos" ? (
        <Campo id="frecuenciaPago" label="Frecuencia de pago">
          <Select id="frecuenciaPago" name="frecuenciaPago" defaultValue={valoresIniciales?.frecuenciaPago ?? ""}>
            <option value="">Selecciona...</option>
            <option value="Semanal">Semanal</option>
            <option value="Quincenal">Quincenal</option>
            <option value="Mensual">Mensual</option>
          </Select>
        </Campo>
      ) : null}

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Artículos</p>

        {catalogoActivo.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <Campo id="articulo-select" label="Del catálogo" className="min-w-0 flex-1">
              <Select
                id="articulo-select"
                value={seleccionId}
                onChange={(e) => setSeleccionId(e.target.value)}
              >
                <option value="">Selecciona...</option>
                {catalogoActivo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — stock: {c.stock}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo id="cantidad-input" label="Cantidad" className="w-24">
              <Input
                id="cantidad-input"
                type="number"
                inputMode="numeric"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </Campo>
            <Button type="button" onClick={agregarArticulo}>
              Agregar
            </Button>
          </div>
        ) : null}

        {/* pieza sin vínculo al catálogo — la mayoría de las
            ventas reales son así (joyería única). No requiere que el
            artículo exista antes en /catalogo. */}
        <div className={cn("flex flex-wrap items-end gap-2", catalogoActivo.length > 0 && "mt-3 border-t pt-3")}>
          <Campo id="nombre-libre" label="Artículo libre (sin catálogo)" className="min-w-0 flex-1">
            <Input
              id="nombre-libre"
              placeholder="Nombre del artículo"
              value={nombreLibre}
              onChange={(e) => setNombreLibre(e.target.value)}
            />
          </Campo>
          <Campo id="precio-libre" label="Precio" className="w-28">
            <Input
              id="precio-libre"
              inputMode="decimal"
              placeholder="0.00"
              value={precioLibre}
              onChange={(e) => setPrecioLibre(e.target.value)}
            />
          </Campo>
          <Campo id="cantidad-libre" label="Cantidad" className="w-24">
            <Input
              id="cantidad-libre"
              type="number"
              inputMode="numeric"
              min={1}
              value={cantidadLibre}
              onChange={(e) => setCantidadLibre(e.target.value)}
            />
          </Campo>
          <Button type="button" variant="outline" onClick={agregarArticuloLibre}>
            Agregar
          </Button>
        </div>
        {errorLibre ? <Alert variant="error" className="mt-2">{errorLibre}</Alert> : null}

        {articulos.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {articulos.map((a, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>
                  {a.cantidad}x {a.nombre}
                </span>
                <div className="flex items-center gap-3">
                  <Currency value={multiplicarMonto(a.precioUnitario, a.cantidad)} />
                  <button
                    type="button"
                    onClick={() => quitarArticulo(i)}
                    className="inline-flex min-h-[44px] items-center text-destructive hover:underline touch-manipulation"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVacio titulo="Sin artículos todavía." className="mt-4 border-0 py-6" />
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-2 text-sm font-semibold">
          Total: <Currency value={total} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="tieneEnganche"
          name="tieneEnganche"
          checked={tieneEnganche}
          onCheckedChange={setTieneEnganche}
        />
        <Label htmlFor="tieneEnganche">Con enganche</Label>
      </div>
      {tieneEnganche ? (
        <CampoTexto
          id="enganche"
          label="Monto del enganche"
          placeholder="0.00"
          inputMode="decimal"
          defaultValue={valoresIniciales?.enganche}
        />
      ) : null}

      {!estado.ok ? <Alert variant="error">{estado.mensaje}</Alert> : null}

      <Button type="submit" disabled={pendiente || isSubmitting || articulos.length === 0} className="self-start">
        {pendiente || isSubmitting ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
