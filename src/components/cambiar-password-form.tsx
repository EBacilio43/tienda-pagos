"use client";

import { useActionState, useEffect, useRef } from "react";
import { cambiarPasswordPropiaAction } from "@/server/actions/usuarios";
import type { EstadoFormularioUsuario } from "@/server/actions/usuarios";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CampoTexto } from "@/components/campo";

const ESTADO_INICIAL: EstadoFormularioUsuario = {};

export function CambiarPasswordForm() {
  const [estado, ejecutar, pendiente] = useActionState(cambiarPasswordPropiaAction, ESTADO_INICIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.exito) formRef.current?.reset();
  }, [estado.exito]);

  return (
    <form ref={formRef} action={ejecutar} className="flex max-w-sm flex-col gap-4">
      <CampoTexto
        id="passwordActual"
        label="Contraseña actual"
        type="password"
        required
      />
      <CampoTexto
        id="passwordNueva"
        label="Nueva contraseña"
        type="password"
        errores={estado.errores?.passwordNueva}
        required
      />
      <CampoTexto
        id="confirmar"
        label="Confirmar nueva contraseña"
        type="password"
        errores={estado.errores?.confirmar}
        required
      />

      {estado.mensaje ? (
        <Alert variant={estado.exito ? "exito" : "error"}>{estado.mensaje}</Alert>
      ) : null}

      <Button type="submit" disabled={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
