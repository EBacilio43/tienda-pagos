"use client";

import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";

type ResultadoConfirmacion = { ok?: boolean; mensaje?: string } | void;

// Fase 9 / ADR-17. Colapsa boton-eliminar-cliente.tsx, boton-cerrar-sesion.tsx
// y boton-eliminar-registro.tsx — los tres eran el mismo componente
// (useTransition + confirm() + texto de error) escrito tres veces. `accion`
// hace todo el trabajo real (llama al Server Action y, si necesita
// actualizar estado local como catalogo-grid, lo hace dentro del closure) y
// solo debe devolver `{mensaje}` cuando algo salió mal — así el mismo
// componente sirve tanto para acciones con redirect() (que nunca vuelven a
// resolver en éxito) como para las que devuelven {ok, mensaje}.
export function BotonConfirmarAccion({
  etiqueta,
  etiquetaPendiente,
  titulo,
  descripcion,
  textoConfirmar = "Eliminar",
  variante = "destructive",
  presentacion = "boton",
  size = "sm",
  accion,
}: {
  etiqueta: string;
  etiquetaPendiente: string;
  titulo: string;
  descripcion: string;
  textoConfirmar?: string;
  variante?: "destructive" | "outline";
  presentacion?: "boton" | "enlace";
  size?: "sm" | "default";
  accion: () => Promise<ResultadoConfirmacion>;
}) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  function confirmar() {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await accion();
      if (resultado?.mensaje) {
        setError(resultado.mensaje);
      } else {
        setAbierto(false);
      }
    });
  }

  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(open) => {
        if (pendiente) return;
        setAbierto(open);
        if (open) setError(null);
      }}
    >
      <AlertDialogTrigger
        disabled={pendiente}
        className={
          presentacion === "enlace"
            ? "inline-flex min-h-[44px] items-center text-xs text-destructive hover:underline disabled:opacity-50 touch-manipulation"
            : buttonVariants({ variant: variante, size })
        }
      >
        {pendiente ? etiquetaPendiente : etiqueta}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button variant={variante} onClick={confirmar} disabled={pendiente}>
            {pendiente ? etiquetaPendiente : textoConfirmar}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
