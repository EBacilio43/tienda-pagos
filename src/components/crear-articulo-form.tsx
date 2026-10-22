"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { crearArticuloAction, type ResultadoAccion } from "@/server/actions/catalogo";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { CampoTexto } from "@/components/campo";

const ESTADO_INICIAL: ResultadoAccion = { ok: true };

export function CrearArticuloForm() {
  const router = useRouter();
  const [estado, ejecutar, pendiente] = useActionState(crearArticuloAction, ESTADO_INICIAL);

  useEffect(() => {
    if (estado.ok) {
      router.refresh();
    }
  }, [estado, router]);

  return (
    <form action={ejecutar} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      {/* El nombre toma el renglón completo en móvil: con w-48 fijo, el
          precio se le pegaba al lado en 136 px y el input quedaba
          inservible para escribir. */}
      <div className="w-full sm:w-48">
        <CampoTexto id="nombre" label="Nombre" required />
      </div>
      <div className="w-28">
        <CampoTexto id="precio" label="Precio" placeholder="0.00" inputMode="decimal" required />
      </div>
      <div className="w-24">
        <CampoTexto id="stockMinimo" label="Stock mínimo" type="number" min={0} inputMode="numeric" defaultValue="0" />
      </div>
      <div className="flex items-center gap-1.5 pb-1.5">
        <Checkbox id="activo" name="activo" defaultChecked />
        <Label htmlFor="activo">Activo</Label>
      </div>
      <Button type="submit" disabled={pendiente}>
        {pendiente ? "Creando…" : "Agregar artículo"}
      </Button>
      {!estado.ok ? (
        <Alert variant="error" className="w-full">
          {estado.mensaje}
        </Alert>
      ) : null}
    </form>
  );
}
