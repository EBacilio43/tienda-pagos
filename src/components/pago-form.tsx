"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import type { ResultadoAccion } from "@/server/actions/pagos";
import { generarTokenIdempotencia } from "@/lib/idempotencia";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Campo, CampoTexto, propsControl } from "@/components/campo";
import { Select } from "@/components/ui/select";
import { METODOS_PAGO, METODO_PAGO_POR_DEFECTO } from "@/lib/schemas/pago";
import { CampoFecha } from "@/components/campo-fecha";

type Accion = (prevState: unknown, formData: FormData) => Promise<ResultadoAccion>;

const ESTADO_INICIAL: ResultadoAccion = { ok: true };

export function PagoForm({
  accion,
  idCliente,
  valoresIniciales,
  textoBoton,
}: {
  accion: Accion;
  idCliente: number;
  valoresIniciales?: {
    fecha?: string;
    monto?: string;
    metodoPago?: string | null;
    referencia?: string | null;
    notas?: string | null;
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

  return (
    <form action={ejecutar} onSubmit={manejarSubmit} className="flex max-w-lg flex-col gap-4">
      <input type="hidden" name="idCliente" value={idCliente} />
      <input type="hidden" name="idempotencyToken" value={idempotencyToken} />

      {/* Una columna en móvil: a dos columnas, el input[type=date] no
          cabe en su mitad (~130 px dentro del modal) y se desborda. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoFecha defaultValue={valoresIniciales?.fecha} required />
        <CampoTexto
          id="monto"
          label="Monto"
          placeholder="0.00"
          inputMode="decimal"
          defaultValue={valoresIniciales?.monto}
          required
        />
      </div>

      <Campo id="metodoPago" label="Método de pago">
        <Select
          defaultValue={valoresIniciales?.metodoPago ?? METODO_PAGO_POR_DEFECTO}
          {...propsControl("metodoPago")}
        >
          {METODOS_PAGO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Campo>
      <CampoTexto id="referencia" label="Referencia" defaultValue={valoresIniciales?.referencia} />
      <CampoTexto id="notas" label="Notas" defaultValue={valoresIniciales?.notas} />

      {!estado.ok ? <Alert variant="error">{estado.mensaje}</Alert> : null}

      <Button type="submit" disabled={pendiente || isSubmitting} className="self-start">
        {pendiente || isSubmitting ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
