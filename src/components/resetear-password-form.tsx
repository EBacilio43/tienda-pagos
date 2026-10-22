"use client";

import { useActionState } from "react";
import type { EstadoFormularioUsuario } from "@/server/actions/usuarios";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CampoTexto } from "@/components/campo";

type Accion = (
  prevState: EstadoFormularioUsuario,
  formData: FormData
) => Promise<EstadoFormularioUsuario>;

const ESTADO_INICIAL: EstadoFormularioUsuario = {};

export function ResetearPasswordForm({ accion }: { accion: Accion }) {
  const [estado, ejecutar, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="flex max-w-sm flex-col gap-4">
      <CampoTexto
        id="password"
        label="Nueva contraseña"
        type="password"
        errores={estado.errores?.password}
        required
      />
      <CampoTexto
        id="confirmar"
        label="Confirmar contraseña"
        type="password"
        errores={estado.errores?.confirmar}
        required
      />

      <p className="text-xs text-muted-foreground">
        Además de cambiar la contraseña, esto desbloquea al usuario si tenía intentos fallidos
        acumulados.
      </p>

      {estado.mensaje ? <Alert variant="error">{estado.mensaje}</Alert> : null}

      <Button type="submit" disabled={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Resetear contraseña"}
      </Button>
    </form>
  );
}
