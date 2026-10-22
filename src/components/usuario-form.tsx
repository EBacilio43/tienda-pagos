"use client";

import { useActionState } from "react";
import type { EstadoFormularioUsuario } from "@/server/actions/usuarios";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Campo, CampoTexto, propsControl } from "@/components/campo";

type Accion = (
  prevState: EstadoFormularioUsuario,
  formData: FormData
) => Promise<EstadoFormularioUsuario>;

const ESTADO_INICIAL: EstadoFormularioUsuario = {};

export function UsuarioForm({ accion, textoBoton }: { accion: Accion; textoBoton: string }) {
  const [estado, ejecutar, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="flex max-w-md flex-col gap-4">
      <CampoTexto id="username" label="Username" errores={estado.errores?.username} required />
      <CampoTexto
        id="nombreCompleto"
        label="Nombre completo"
        errores={estado.errores?.nombreCompleto}
        required
      />
      <CampoTexto id="email" label="Email" type="email" errores={estado.errores?.email} />

      <Campo id="rol" label="Rol" errores={estado.errores?.rol}>
        <Select defaultValue="operador" required {...propsControl("rol", estado.errores?.rol)}>
          <option value="consulta">Consulta — solo lectura</option>
          <option value="operador">Operador — ventas, pagos, devoluciones</option>
          <option value="admin">Admin — acceso total</option>
        </Select>
      </Campo>

      <CampoTexto
        id="password"
        label="Contraseña"
        type="password"
        errores={estado.errores?.password}
        required
      />

      {estado.mensaje ? <Alert variant="error">{estado.mensaje}</Alert> : null}

      <Button type="submit" disabled={pendiente} className="self-start">
        {pendiente ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
