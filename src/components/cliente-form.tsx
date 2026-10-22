"use client";

import { useActionState } from "react";
import type { EstadoFormularioCliente } from "@/server/actions/clientes";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CampoTexto } from "@/components/campo";

type Accion = (
  prevState: EstadoFormularioCliente,
  formData: FormData
) => Promise<EstadoFormularioCliente>;

type Valores = {
  nombre?: string;
  email?: string | null;
  telefono?: string | null;
  empresa?: string | null;
  calle?: string | null;
  numExt?: string | null;
  numInt?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  estado?: string | null;
  cp?: string | null;
};

const ESTADO_INICIAL: EstadoFormularioCliente = {};

export function ClienteForm({
  accion,
  valoresIniciales,
  textoBoton,
}: {
  accion: Accion;
  valoresIniciales?: Valores;
  textoBoton: string;
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="flex max-w-xl flex-col gap-4">
      <CampoTexto
        id="nombre"
        label="Nombre"
        defaultValue={valoresIniciales?.nombre}
        errores={estado.errores?.nombre}
        required
      />
      <CampoTexto
        id="email"
        label="Email"
        type="email"
        defaultValue={valoresIniciales?.email}
        errores={estado.errores?.email}
      />
      <CampoTexto
        id="telefono"
        label="Teléfono"
        type="tel"
        inputMode="tel"
        defaultValue={valoresIniciales?.telefono}
        errores={estado.errores?.telefono}
      />
      <CampoTexto
        id="empresa"
        label="Empresa"
        defaultValue={valoresIniciales?.empresa}
        errores={estado.errores?.empresa}
      />
      {/* Tres columnas fijas dejaban cada campo en ~95 px en el teléfono, y
          la etiqueta "Núm. ext." ya no cabe ahí. En móvil la calle ocupa el
          renglón completo y los dos números comparten el siguiente, que es
          como se escribe una dirección. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CampoTexto
          id="calle"
          label="Calle"
          defaultValue={valoresIniciales?.calle}
          className="col-span-2 sm:col-span-1"
        />
        <CampoTexto id="numExt" label="Núm. ext." defaultValue={valoresIniciales?.numExt} />
        <CampoTexto id="numInt" label="Núm. int." defaultValue={valoresIniciales?.numInt} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto id="colonia" label="Colonia" defaultValue={valoresIniciales?.colonia} />
        <CampoTexto id="cp" label="C.P." inputMode="numeric" defaultValue={valoresIniciales?.cp} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto id="municipio" label="Municipio" defaultValue={valoresIniciales?.municipio} />
        <CampoTexto id="estado" label="Estado" defaultValue={valoresIniciales?.estado} />
      </div>

      {estado.mensaje ? <Alert variant="error">{estado.mensaje}</Alert> : null}

      <Button type="submit" disabled={pendiente} className="self-start">
        {pendiente ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
