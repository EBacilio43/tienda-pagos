"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Eye, Download, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export type ClientePrevisualizable = { id: number; nombre: string };

// Previsualiza el PDF real en un <iframe>, no una reconstrucción en HTML:
// el objetivo de una vista previa es ver exactamente lo que se va a
// descargar. La CSP lo permite sin cambios — `default-src 'self'` cubre
// frame-src para un iframe del mismo origen, y `object-src 'none'` solo
// afecta a <object>/<embed>. Lo que sí hizo falta fue relajar
// `X-Frame-Options` a SAMEORIGIN para /api/reportes (next.config.ts): DENY
// prohíbe enmarcar incluso desde el propio origen.
//
// Con varios clientes se navega de uno en uno en vez de mostrar un
// documento combinado. El motivo es de coherencia, no de capricho: desde
// que "Descargar" entrega un PDF por cliente, previsualizar un documento
// con todos pegados mostraría algo que no existe en ningún archivo — y la
// razón de ser de esta vista previa es que lo que se ve sea exactamente lo
// que se baja.
export function PrevisualizarEstadoCuenta({
  clientes,
  etiqueta = "Previsualizar",
  variante = "outline",
}: {
  clientes: ClientePrevisualizable[];
  etiqueta?: string;
  variante?: "default" | "outline";
}) {
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);

  if (clientes.length === 0) return null;

  // Si cambia la selección mientras el diálogo está cerrado, el índice
  // viejo puede quedar fuera de rango. Se acota al leer en vez de
  // sincronizar con un efecto: no hay nada que sincronizar, es un derivado.
  const actual = Math.min(indice, clientes.length - 1);
  const cliente = clientes[actual];
  const varios = clientes.length > 1;

  const url = (vista: "previa" | "descarga") =>
    `/api/reportes/estado-cuenta?clienteId=${cliente.id}${vista === "previa" ? "&vista=previa" : ""}`;

  return (
    <Dialog.Root
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        // Abrir siempre empieza por el primero: reanudar en el cliente 4 de
        // una selección anterior sería desconcertante.
        if (v) setIndice(0);
      }}
    >
      <Dialog.Trigger className={buttonVariants({ variant: variante, size: "sm" })}>
        <Eye className="size-4" />
        {etiqueta}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        {/* A pantalla completa en el teléfono. Un PDF tamaño carta dentro
            de un recuadro de 328 px, con 12 % de la pantalla gastado en
            márgenes, no se lee; aquí cada pixel cuenta más que el diálogo
            flotante. De `sm` para arriba vuelve a ser la tarjeta centrada
            de siempre. */}
        <Dialog.Popup className="fixed inset-0 z-50 flex w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-card text-card-foreground shadow-lg outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[88dvh] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border">
          {/* El título y las acciones eran dos bloques `shrink-0` en un
              contenedor sin wrap: en el teléfono no cabían y el botón de
              descargar terminaba encima del título. Ahora la fila envuelve,
              y el navegador entre clientes se va a su propio renglón en
              móvil (`basis-full` + `order-last`) y vuelve a la línea del
              título de `sm` para arriba. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
              Estado de cuenta
            </Dialog.Title>

            {varios ? (
              <div className="order-last flex min-w-0 basis-full items-center gap-1 text-sm text-muted-foreground sm:order-none sm:basis-auto">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIndice(actual - 1)}
                  disabled={actual === 0}
                >
                  <ChevronLeft className="size-4" />
                  <span className="sr-only">Cliente anterior</span>
                </Button>
                <span className="truncate">
                  <span className="font-medium text-foreground">{cliente.nombre}</span>{" "}
                  <span className="tabular-nums">
                    ({actual + 1} de {clientes.length})
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIndice(actual + 1)}
                  disabled={actual === clientes.length - 1}
                >
                  <ChevronRight className="size-4" />
                  <span className="sr-only">Cliente siguiente</span>
                </Button>
              </div>
            ) : null}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* <a> y no <Link>: es una descarga, no navegación del router.
                  Baja el que se está viendo, no la selección entera — para
                  bajarlos todos está el botón de la lista de clientes. */}
              <a href={url("descarga")} className={buttonVariants({ size: "sm" })}>
                <Download className="size-4" />
                {/* En el teléfono el botón es solo el ícono: con el texto,
                    título + botón + cerrar suman más de los 360 px que hay,
                    y era eso lo que empujaba al botón encima del título.
                    `sr-only` conserva el nombre accesible en los dos casos. */}
                <span className="sr-only sm:not-sr-only">Descargar</span>
              </a>
              <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <X className="size-4" />
                <span className="sr-only">Cerrar</span>
              </Dialog.Close>
            </div>
          </div>

          {/* El iframe se monta SOLO al abrir: si estuviera siempre en el
              árbol, cada carga de /clientes generaría un PDF completo en el
              servidor sin que nadie lo pidiera. La `key` fuerza un iframe
              nuevo al cambiar de cliente — sin ella, algunos visores de PDF
              se quedan mostrando el documento anterior. */}
          {abierto ? (
            <iframe
              key={cliente.id}
              src={url("previa")}
              title={`Estado de cuenta de ${cliente.nombre}`}
              className="min-h-0 flex-1 border-0 bg-muted"
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
