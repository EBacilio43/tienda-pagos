"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import type { ResultadoAccion } from "@/server/actions/devoluciones";
import type { ArticuloDevolubleDTO } from "@/types/dominio";
import { generarTokenIdempotencia } from "@/lib/idempotencia";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Campo, CampoTexto } from "@/components/campo";
import { EstadoVacio } from "@/components/estado-vacio";
import { Currency } from "@/components/currency";
import {
  sumarMontos,
  multiplicarMonto,
  compararMontos,
  formatearMoneda,
  REGEX_MONTO,
} from "@/lib/money";
import { claveArticulo } from "@/lib/articulos";
import { CampoFecha } from "@/components/campo-fecha";

type Accion = (prevState: unknown, formData: FormData) => Promise<ResultadoAccion>;

// `precioUnitario` es el precio al que la pieza se VENDIÓ y no se edita: es
// la identidad del artículo cuando no hay catálogo (lib/articulos.ts), así
// que tocarlo desemparejaría la devolución de su venta. Lo editable es
// `precioCredito`, que arranca igual al de venta y aquí siempre es texto —
// el null que significa "sin ajuste" se arma al enviar.
type LineaDevolucion = {
  idCatalogo: number | null;
  nombre: string;
  cantidad: number;
  precioUnitario: string;
  precioCredito: string;
};

type ArticuloInicial = {
  idCatalogo: number | null;
  nombre: string;
  cantidad: number;
  precioUnitario: string;
  precioCredito?: string | null;
};

const ESTADO_INICIAL: ResultadoAccion = { ok: true };

export function DevolucionForm({
  accion,
  idCliente,
  devolubles,
  valoresIniciales,
  textoBoton,
}: {
  accion: Accion;
  idCliente: number;
  devolubles: ArticuloDevolubleDTO[];
  valoresIniciales?: {
    fecha?: string;
    motivo?: string | null;
    articulos?: ArticuloInicial[];
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

  const [articulos, setArticulos] = useState<LineaDevolucion[]>(
    (valoresIniciales?.articulos ?? []).map((a) => ({
      idCatalogo: a.idCatalogo,
      nombre: a.nombre,
      cantidad: a.cantidad,
      precioUnitario: a.precioUnitario,
      precioCredito: a.precioCredito ?? a.precioUnitario,
    }))
  );
  const [seleccionClave, setSeleccionClave] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [error, setError] = useState<string | null>(null);

  function disponiblePara(clave: string): number {
    return devolubles.find((d) => d.clave === clave)?.cantidadDisponible ?? 0;
  }

  function agregarArticulo() {
    setError(null);
    const item = devolubles.find((d) => d.clave === seleccionClave);
    const qty = Number.parseInt(cantidad, 10);
    if (!item || !Number.isInteger(qty) || qty <= 0) return;

    const yaEnLista = articulos.find((a) => claveArticulo(a) === item.clave)?.cantidad ?? 0;
    if (yaEnLista + qty > item.cantidadDisponible) {
      setError(
        `No puedes devolver más de lo comprado. Disponible: ${item.cantidadDisponible}, ya agregado: ${yaEnLista}.`
      );
      return;
    }

    setArticulos((prev) => {
      const existente = prev.find((a) => claveArticulo(a) === item.clave);
      // Al sumar cantidad a un renglón que ya está se respeta el precio
      // acreditado que el operador ya escribió — reponerlo al de venta
      // borraría el ajuste sin decirlo.
      if (existente) {
        return prev.map((a) =>
          claveArticulo(a) === item.clave ? { ...a, cantidad: a.cantidad + qty } : a
        );
      }
      return [
        ...prev,
        {
          idCatalogo: item.idCatalogo,
          nombre: item.nombre,
          cantidad: qty,
          precioUnitario: item.precioUnitario,
          precioCredito: item.precioUnitario,
        },
      ];
    });
    setSeleccionClave("");
    setCantidad("1");
  }

  function cambiarCredito(clave: string, valor: string) {
    setArticulos((prev) =>
      prev.map((a) => (claveArticulo(a) === clave ? { ...a, precioCredito: valor } : a))
    );
  }

  function quitarArticulo(clave: string) {
    setArticulos((prev) => prev.filter((a) => claveArticulo(a) !== clave));
  }

  // El tope lo aplica también el servicio (y la base, con un CHECK), pero
  // decirlo aquí evita mandar un formulario que ya se sabe que va a volver.
  function problemaDeCredito(a: LineaDevolucion): string | null {
    const valor = a.precioCredito.trim();
    if (!REGEX_MONTO.test(valor)) return `Monto a acreditar inválido en "${a.nombre}".`;
    if (compararMontos(valor, a.precioUnitario) > 0) {
      return `No se puede acreditar más de ${formatearMoneda(a.precioUnitario)} por "${a.nombre}" — es el precio al que se vendió.`;
    }
    return null;
  }

  const errorCredito = articulos.map(problemaDeCredito).find((m) => m !== null) ?? null;

  // Con un monto inválido no se calcula nada: `compararMontos` y
  // `multiplicarMonto` esperan un monto de verdad, y un total a medias sería
  // peor que ninguno.
  const total =
    errorCredito !== null || articulos.length === 0
      ? null
      : sumarMontos(...articulos.map((a) => multiplicarMonto(a.precioCredito, a.cantidad)));

  const articulosParaEnviar =
    errorCredito !== null
      ? []
      : articulos.map((a) => ({
          idCatalogo: a.idCatalogo,
          nombre: a.nombre,
          cantidad: a.cantidad,
          precioUnitario: a.precioUnitario,
          // null = sin ajuste. Se manda solo cuando de verdad difiere, para
          // que la columna signifique "hubo excepción" y no "alguien tocó el
          // campo y lo dejó igual".
          precioCredito:
            compararMontos(a.precioCredito, a.precioUnitario) === 0 ? null : a.precioCredito,
        }));

  return (
    <form action={ejecutar} onSubmit={manejarSubmit} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="idCliente" value={idCliente} />
      <input type="hidden" name="idempotencyToken" value={idempotencyToken} />
      <input type="hidden" name="articulosJson" value={JSON.stringify(articulosParaEnviar)} />

      <CampoFecha defaultValue={valoresIniciales?.fecha} required />
      <CampoTexto id="motivo" label="Motivo" defaultValue={valoresIniciales?.motivo} />

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Artículos a devolver</p>
        {devolubles.length === 0 ? (
          <EstadoVacio
            titulo="Este cliente no tiene artículos disponibles para devolver."
            className="border-0 py-6"
          />
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Campo id="articulo-select" label="Artículo" className="min-w-0 flex-1">
              <Select
                id="articulo-select"
                value={seleccionClave}
                onChange={(e) => setSeleccionClave(e.target.value)}
              >
                <option value="">Selecciona...</option>
                {devolubles.map((d) => (
                  <option key={d.clave} value={d.clave}>
                    {d.nombre} — disponible: {d.cantidadDisponible}
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
        )}

        {error ? <Alert variant="error" className="mt-2">{error}</Alert> : null}

        {articulos.length > 0 ? (
          <ul className="mt-4 flex flex-col divide-y">
            {articulos.map((a, i) => {
              const clave = claveArticulo(a);
              const problema = problemaDeCredito(a);
              const ajustado =
                problema === null && compararMontos(a.precioCredito, a.precioUnitario) !== 0;
              return (
                <li
                  key={clave}
                  className="flex flex-wrap items-end justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {a.cantidad}x {a.nombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vendido a <Currency value={a.precioUnitario} /> c/u · disponible:{" "}
                      {disponiblePara(clave)}
                    </p>
                  </div>
                  <div className="flex items-end gap-3">
                    {/* El precio acreditado se captura por pieza, no como un
                        total de la devolución: de tres piezas puede venir una
                        sola con desgaste, y así el desglose sigue sumando
                        exactamente el crédito. */}
                    <Campo id={`credito-${i}`} label="Se acredita c/u" className="w-28">
                      <Input
                        id={`credito-${i}`}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={a.precioCredito}
                        onChange={(e) => cambiarCredito(clave, e.target.value)}
                      />
                    </Campo>
                    <div className="pb-2 text-right">
                      <p className="text-sm font-medium">
                        {problema !== null ? (
                          "—"
                        ) : (
                          <Currency
                            value={multiplicarMonto(a.precioCredito, a.cantidad)}
                            tono={ajustado ? "devolucion" : "neutro"}
                          />
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => quitarArticulo(clave)}
                        className="inline-flex min-h-[44px] items-center text-xs text-destructive hover:underline touch-manipulation"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {errorCredito !== null ? (
          <Alert variant="error" className="mt-3">
            {errorCredito}
          </Alert>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-2 text-sm font-semibold">
          Crédito: {total === null ? "—" : <Currency value={total} />}
        </div>
      </div>

      {!estado.ok ? <Alert variant="error">{estado.mensaje}</Alert> : null}

      <Button
        type="submit"
        disabled={pendiente || isSubmitting || articulos.length === 0 || errorCredito !== null}
        className="self-start"
      >
        {pendiente || isSubmitting ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
