"use client";

import { useActionState } from "react";
import { loginAction, type EstadoLogin } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CampoTexto } from "@/components/campo";

const estadoInicial: EstadoLogin = {};

export function LoginForm() {
  const [estado, accion, pendiente] = useActionState(loginAction, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <CampoTexto id="username" label="Usuario" autoComplete="username" required />
      <CampoTexto
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
      />
      {estado.mensaje ? <Alert variant="error">{estado.mensaje}</Alert> : null}
      <Button type="submit" disabled={pendiente}>
        {pendiente ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
