"use client";

import { useActionState } from "react";
import type { EstadoFormularioUsuario } from "@/server/actions/usuarios";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Campo, CampoTexto, propsControl } from "@/components/campo";

type Accion = (
  prevState: EstadoFormularioUsuario,
  formData: FormData
) => Promise<EstadoFormularioUsuario>;

const ESTADO_INICIAL: EstadoFormularioUsuario = {};

export function EditarUsuarioForm({
  accion,
  valoresIniciales,
}: {
  accion: Accion;
  valoresIniciales: { nombreCompleto: string; email: string | null; rol: string; activo: boolean };
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={ejecutar} className="flex max-w-md flex-col gap-4">
      <CampoTexto
        id="nombreCompleto"
        label="Nombre completo"
        defaultValue={valoresIniciales.nombreCompleto}
        errores={estado.errores?.nombreCompleto}
        required
      />
      <CampoTexto
        id="email"
        label="Email"
        type="email"
        defaultValue={valoresIniciales.email}
        errores={estado.errores?.email}
      />

      <Campo id="rol" label="Rol" errores={estado.errores?.rol}>
        <Select
          defaultValue={valoresIniciales.rol}
          required
          {...propsControl("rol", estado.errores?.rol)}
        >
          <option value="consulta">Consulta — solo lectura</option>
          <option value="operador">Operador — ventas, pagos, devoluciones</option>
          <option value="admin">Admin — acceso total</option>
        </Select>
      </Campo>

      <div className="flex items-center gap-2">
        <Checkbox id="activo" name="activo" defaultChecked={valoresIniciales.activo} />
        <Label htmlFor="activo">Activo</Label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Desmarcar desactiva al usuario y cierra sus sesiones activas al instante.
      </p>

      {estado.mensaje ? <Alert variant="error">{estado.mensaje}</Alert> : null}

      <Button type="submit" disabled={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
