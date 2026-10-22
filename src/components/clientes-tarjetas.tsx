"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, Mail, HandCoins } from "lucide-react";
import { Currency, type TonoMonto } from "@/components/currency";
import { Fecha } from "@/components/fecha";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EstadoVacio } from "@/components/estado-vacio";
import { PrevisualizarEstadoCuenta } from "@/components/previsualizar-estado-cuenta";
import { cn } from "@/lib/utils";
import type { ClienteListaDTO } from "@/types/dominio";

// Iniciales para el avatar: dos palabras como máximo. No es identidad
// visual del cliente, es un ancla para escanear la lista — por eso el
// círculo va en tokens neutros de cromo y no coloreado por cliente
// (docs/DISENO.md: el color es dato, no decoración).
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  return palabras
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// El saldo se clasifica por texto, nunca con Number() (regla 1). Las tres
// situaciones son de negocio distintas y merecen leerse distinto:
// docs/DOMINIO.md permite saldo negativo (cliente a favor) y no lo trunca.
function estadoSaldo(saldo: string): { etiqueta: string; tono: TonoMonto } {
  if (saldo.trim().startsWith("-")) return { etiqueta: "A favor", tono: "abono" };
  if (/^0+(\.0+)?$/.test(saldo.trim())) return { etiqueta: "Al corriente", tono: "neutro" };
  return { etiqueta: "Saldo pendiente", tono: "saldo" };
}

export function ClientesTarjetas({ clientes }: { clientes: ClienteListaDTO[] }) {
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());

  function alternar(id: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // En el orden en que se ven en pantalla, no en el que se fueron marcando:
  // el Set conserva el orden de inserción y eso haría que la vista previa
  // numerara "1 de 3" siguiendo los clics, que nadie recuerda.
  const elegidos = clientes.filter((c) => seleccionados.has(c.id));

  // Un PDF por cliente, no un documento con todos pegados. Cada archivo se
  // imprime, se manda o se archiva por su cuenta, que es lo que se hace con
  // un estado de cuenta; uno combinado obliga a partirlo a mano.
  //
  // Son descargas de verdad (Content-Disposition: attachment), así que basta
  // con un <a> sintético por cliente. El desfase entre una y otra no es
  // supersticioso: disparadas en el mismo tick, Chrome y Edge se quedan solo
  // con la primera. La primera vez el navegador pide permiso para descargar
  // varios archivos del sitio, y lo recuerda.
  function descargarPorSeparado() {
    elegidos.forEach((c, i) => {
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = `/api/reportes/estado-cuenta?clienteId=${c.id}`;
        // `download` es obligatorio aquí, y no por el nombre del archivo: sin
        // él cada clic es una NAVEGACIÓN, y el navegador solo admite una a la
        // vez — la segunda cancelaba la primera antes de que el servidor
        // terminara de generar el PDF, así que de dos clientes se bajaba uno
        // (medido). Con `download` la petición nace como descarga y conviven.
        // El nombre sigue saliendo del Content-Disposition del servidor, que
        // tiene prioridad sobre este atributo.
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  }

  if (clientes.length === 0) {
    return <EstadoVacio titulo="Sin resultados" descripcion="Ningún cliente coincide con la búsqueda." />;
  }

  return (
    <div>
      {/* `h-8` fijo + sin wrap: en móvil los tres botones de acción y el
          texto no caben en un renglón, y la altura congelada los hacía
          desbordarse por encima de las tarjetas en vez de empujarlas.
          min-h-8 conserva el motivo original (que la fila no salte de alto
          al aparecer los botones) sin impedir que crezca. */}
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-sm text-muted-foreground">
          {seleccionados.size > 0
            ? `${seleccionados.size} seleccionado${seleccionados.size === 1 ? "" : "s"}`
            : "Selecciona clientes para registrar sus abonos o descargar su estado de cuenta"}
        </span>
        {seleccionados.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/pagos/lote?${Array.from(seleccionados)
                .map((id) => `clienteId=${id}`)
                .join("&")}`}
              className={buttonVariants({ size: "sm" })}
            >
              Registrar abonos ({seleccionados.size})
            </Link>
            <PrevisualizarEstadoCuenta
              clientes={elegidos.map((c) => ({ id: c.id, nombre: c.nombre }))}
              etiqueta={`Estado de cuenta (${seleccionados.size})`}
            />
            {/* Botón y no <a>: ya no hay una sola URL que enlazar, son N
                descargas disparadas desde JS. */}
            <Button variant="outline" size="sm" onClick={descargarPorSeparado}>
              Descargar PDF ({seleccionados.size})
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clientes.map((c) => {
          const estado = estadoSaldo(c.saldo);
          const seleccionado = seleccionados.has(c.id);

          return (
            <div
              key={c.id}
              className={cn(
                "relative rounded-xl border bg-card transition-colors",
                seleccionado && "border-primary"
              )}
            >
              {/* El checkbox vive FUERA del <Link>, no dentro: anidar un
                  control interactivo dentro de un enlace es HTML inválido y
                  hace que un clic en la casilla también navegue.

                  `before:-inset-3` agranda el área clicable a ~44px sin
                  agrandar el recuadro dibujado: el pseudo-elemento recibe
                  los clics igual que el control. Se hace así, y no con un
                  <div> envolvente que llame a alternar(), porque eso
                  duplicaría el disparo al hacer clic justo sobre la casilla.
                  Los 12px de expansión coinciden con top-3/right-3, así que
                  la zona llega al borde de la tarjeta y ni un pixel más. */}
              <div className="absolute top-3 right-3 z-10">
                <Checkbox
                  checked={seleccionado}
                  onCheckedChange={() => alternar(c.id)}
                  aria-label={`Seleccionar ${c.nombre}`}
                  className="relative size-5 before:absolute before:-inset-3 before:content-['']"
                />
              </div>

              <Link
                href={`/clientes/${c.id}`}
                className="block rounded-xl p-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-sm font-semibold text-muted-foreground">
                    {iniciales(c.nombre)}
                  </div>
                  <div className="min-w-0 flex-1 pr-9">
                    <p className="truncate font-heading font-medium">{c.nombre}</p>
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      {estado.etiqueta}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-2xl font-bold">
                  <Currency value={c.saldo} tono={estado.tono} />
                </p>

                {/* Teléfono y email SOLO si existen. Antes se pintaban
                    siempre, y como casi ningún cliente los tiene capturado
                    (2 de 11 en la copia de producción; ninguna de las 41
                    cuentas cargadas de libreta), dos de los tres renglones
                    de la tarjeta no decían nada — y eso, multiplicado por
                    20 tarjetas por página, es el doble de scroll en el
                    teléfono para leer la misma información. El último abono
                    sí va siempre: "nunca ha abonado" es un dato, no un
                    hueco. */}
                <div className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <HandCoins className="size-3.5 shrink-0" />
                    {c.ultimoAbono ? (
                      <>
                        Último abono <Fecha value={c.ultimoAbono} formato="largo" />
                      </>
                    ) : (
                      "Nunca ha abonado"
                    )}
                  </span>
                  {c.telefono ? (
                    <span className="flex items-center gap-2">
                      <Phone className="size-3.5 shrink-0" />
                      <span className="truncate">{c.telefono}</span>
                    </span>
                  ) : null}
                  {c.email ? (
                    <span className="flex items-center gap-2">
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </span>
                  ) : null}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
