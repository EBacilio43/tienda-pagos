import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Currency } from "@/components/currency";
import { compararMontos } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  DIAS_SEMANA,
  celdasDelMes,
  etiquetaMes,
  mesAnterior,
  mesSiguiente,
} from "@/lib/calendario";
import type { DiaActividadDTO } from "@/types/dominio";

// La cuadrícula del mes. Es Server Component a propósito: no hay estado —
// el mes y el día elegido viven en la URL, y navegar entre meses es un
// enlace, no un `useState`. Eso es lo que hace que "compárteme el 5 de
// septiembre" sea un enlace que funciona, el mismo criterio por el que
// ADR-05 rechazó los diálogos apilados de NiceGUI.

// Regla 1: el monto es string y nunca pasa por Number(). "¿hubo dinero
// este día?" se contesta comparando montos como montos — "0.00" y "0" son
// el mismo cero y `!== "0"` diría que no.
function hayMonto(monto: string): boolean {
  return compararMontos(monto, "0") > 0;
}

function hrefCelda(mes: string, fecha: string) {
  return `/actividad?vista=calendario&mes=${mes}&dia=${fecha}`;
}

export function CalendarioActividad({
  mes,
  dias,
  diaElegido,
}: {
  mes: string;
  dias: DiaActividadDTO[];
  diaElegido: string | null;
}) {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const celdas = celdasDelMes(mes);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/actividad?vista=calendario&mes=${mesAnterior(mes)}`}
          aria-label="Mes anterior"
          className="rounded-md border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </Link>

        {/* El locale rinde el mes en minúscula ("septiembre 2026"); la
            mayúscula es presentación y se queda en CSS, no en lib/. */}
        <h2 className="text-sm font-semibold capitalize sm:text-base">{etiquetaMes(mes)}</h2>

        <Link
          href={`/actividad?vista=calendario&mes=${mesSiguiente(mes)}`}
          aria-label="Mes siguiente"
          className="rounded-md border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {DIAS_SEMANA.map((dia, i) => (
          <div
            key={i}
            className="pb-1 text-center text-xs font-medium text-muted-foreground"
            aria-hidden
          >
            {dia}
          </div>
        ))}

        {celdas.map((celda) => {
          const datos = porFecha.get(celda.fecha);
          const cargos = datos && hayMonto(datos.cargos);
          const abonos = datos && hayMonto(datos.abonos);
          const conMovimiento = Boolean(datos && datos.movimientos > 0);
          const elegido = celda.fecha === diaElegido;

          const contenido = (
            <>
              <span
                className={cn(
                  "text-xs tabular-nums sm:text-sm",
                  celda.delMes ? "text-foreground" : "text-muted-foreground/60",
                  elegido && "font-semibold"
                )}
              >
                {celda.dia}
              </span>

              {/* Debajo de `sm` una celda mide ~44 px: no cabe "$12,400.00"
                  sin abreviarlo, y abreviar dinero es justo lo que la regla
                  1 evita en todos lados. Así que en el teléfono la celda
                  marca QUÉ hubo con un punto por tipo, y el cuánto lo dice
                  la lista del día al tocarla — que en móvil es adonde se va
                  a mirar de todos modos. */}
              {conMovimiento && (
                <span className="mt-1 flex gap-1 sm:hidden" aria-hidden>
                  {cargos && <span className="size-1.5 rounded-full bg-venta" />}
                  {abonos && <span className="size-1.5 rounded-full bg-abono" />}
                </span>
              )}

              {conMovimiento && (
                <span className="mt-1 hidden w-full flex-col gap-0.5 leading-tight sm:flex">
                  {cargos && (
                    <Currency value={datos!.cargos} tono="venta" className="block text-[11px]" />
                  )}
                  {abonos && (
                    <Currency value={datos!.abonos} tono="abono" className="block text-[11px]" />
                  )}
                </span>
              )}
            </>
          );

          const claseCelda = cn(
            "flex min-h-14 flex-col items-start rounded-md border p-1 text-left sm:min-h-20 sm:p-1.5",
            celda.delMes ? "bg-card" : "bg-muted/30",
            elegido && "ring-2 ring-ring"
          );

          // Un día sin movimientos no es un enlace: llevaría a una lista
          // vacía. Se dibuja igual para que la retícula no cambie de forma.
          if (!conMovimiento) {
            return (
              <div key={celda.fecha} className={cn(claseCelda, "opacity-70")}>
                {contenido}
              </div>
            );
          }

          return (
            <Link
              key={celda.fecha}
              href={hrefCelda(mes, celda.fecha)}
              aria-current={elegido ? "date" : undefined}
              className={cn(
                claseCelda,
                "outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
              )}
            >
              {contenido}
              <span className="sr-only">
                {datos!.movimientos} {datos!.movimientos === 1 ? "movimiento" : "movimientos"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
