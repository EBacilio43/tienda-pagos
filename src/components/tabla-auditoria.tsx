"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ArrowRight, Globe, Clock, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaVacia } from "@/components/estado-vacio";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CambioAuditoria } from "@/lib/auditoria";
import type { AuditoriaFilaDTO } from "@/types/dominio";

// La pastilla usa las variantes que ya existen; no se inventan colores para
// esto. `crear` y `login` son neutros a propósito: lo que hay que poder
// encontrar de un vistazo en un log de auditoría es lo que borró algo.
const ACCION_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  crear: "secondary",
  actualizar: "outline",
  eliminar: "destructive",
  login: "secondary",
  cerrar_sesion: "destructive",
  resetear_password: "outline",
  cambiar_password: "outline",
  ajustar_stock: "outline",
};

export function TablaAuditoria({ filas }: { filas: AuditoriaFilaDTO[] }) {
  // Un Set y no un solo id: al comparar dos renglones cercanos (lo normal
  // cuando se está reconstruyendo qué pasó) cerrar el anterior al abrir el
  // siguiente obliga a ir y venir.
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());

  function alternar(id: number) {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PanelTabla>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Registro</TableHead>
            {/* Usuario e IP desaparecen en móvil y reaparecen dentro del
                detalle desplegado — no se pierde ningún dato, deja de
                competir por 360 px con lo que identifica al renglón. */}
            <TableHead className="hidden md:table-cell">Usuario</TableHead>
            <TableHead className="hidden lg:table-cell">IP</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.length === 0 ? (
            <FilaVacia colSpan={6}>Sin actividad</FilaVacia>
          ) : (
            filas.map((f) => {
              const abierta = abiertas.has(f.id);
              const cambiados = f.cambios.filter((c) => c.cambio);

              return (
                <FilaAuditoria
                  key={f.id}
                  fila={f}
                  abierta={abierta}
                  cambiados={cambiados.length}
                  alternar={() => alternar(f.id)}
                />
              );
            })
          )}
        </TableBody>
      </Table>
    </PanelTabla>
  );
}

function FilaAuditoria({
  fila,
  abierta,
  cambiados,
  alternar,
}: {
  fila: AuditoriaFilaDTO;
  abierta: boolean;
  cambiados: number;
  alternar: () => void;
}) {
  const idDetalle = `auditoria-detalle-${fila.id}`;

  return (
    <>
      <TableRow
        // El <tr> entero es el área clicable —60 px de alto contra 24 de la
        // flecha—, pero el control real para teclado y lectores de pantalla
        // es el <button> de la última celda, que lleva aria-expanded y
        // aria-controls. Un clic sobre ese botón o sobre el enlace del
        // registro NO debe llegar aquí, o se alternaría dos veces.
        onClick={(evento) => {
          const objetivo = evento.target;
          if (objetivo instanceof HTMLElement && objetivo.closest("a, button")) return;
          alternar();
        }}
        className="cursor-pointer align-top"
      >
        <TableCell className="tabular-nums">
          <div className="whitespace-nowrap">{fila.fecha}</div>
          <div className="text-xs whitespace-nowrap text-muted-foreground">{fila.fechaRelativa}</div>
        </TableCell>
        <TableCell>
          <Badge variant={ACCION_VARIANT[fila.accion] ?? "outline"}>{fila.accionEtiqueta}</Badge>
        </TableCell>
        <TableCell>
          <Registro fila={fila} />
          <div className="text-xs text-muted-foreground md:hidden">
            {fila.usuarioNombre ?? "Sistema"}
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {fila.usuarioNombre ?? <span className="text-muted-foreground">Sistema</span>}
          {fila.usuarioUsername ? (
            <div className="text-xs text-muted-foreground">@{fila.usuarioUsername}</div>
          ) : null}
        </TableCell>
        <TableCell className="hidden tabular-nums lg:table-cell">{fila.ipAddress ?? "—"}</TableCell>
        <TableCell className="text-right">
          <button
            type="button"
            onClick={alternar}
            aria-expanded={abierta}
            aria-controls={idDetalle}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronDown className={cn("size-4 transition-transform", abierta && "rotate-180")} />
            <span className="sr-only">
              {abierta ? "Ocultar el detalle del movimiento" : "Ver el detalle del movimiento"}
            </span>
          </button>
        </TableCell>
      </TableRow>

      {/* El <tr> del detalle se monta solo cuando está abierto: con 40
          renglones por página y hasta 8 campos cada uno, mantenerlos
          montados y ocultos es marcado que nadie va a ver. */}
      {abierta ? (
        <TableRow id={idDetalle} className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-muted/40 p-0 whitespace-normal">
            <div className="flex flex-col gap-3 p-4">
              <MetaDetalle fila={fila} />
              <Cambios cambios={fila.cambios} cambiados={cambiados} accion={fila.accion} />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Registro({ fila }: { fila: AuditoriaFilaDTO }) {
  const texto = fila.registroId ? `${fila.tablaEtiqueta} #${fila.registroId}` : fila.tablaEtiqueta;

  if (!fila.href) {
    return <span className="whitespace-nowrap">{texto}</span>;
  }
  return (
    <Link href={fila.href} className="whitespace-nowrap font-medium hover:underline">
      {texto}
    </Link>
  );
}

function MetaDetalle({ fila }: { fila: AuditoriaFilaDTO }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Clock className="size-3.5 shrink-0" />
        <dt className="sr-only">Fecha y hora exactas</dt>
        <dd className="tabular-nums">{fila.fechaCompleta}</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <User className="size-3.5 shrink-0" />
        <dt className="sr-only">Usuario</dt>
        <dd>
          {fila.usuarioNombre ?? "Sistema"}
          {fila.usuarioUsername ? ` (@${fila.usuarioUsername})` : null}
        </dd>
      </div>
      <div className="flex items-center gap-1.5">
        <Globe className="size-3.5 shrink-0" />
        <dt className="sr-only">Dirección IP</dt>
        <dd className="tabular-nums">{fila.ipAddress ?? "sin IP registrada"}</dd>
      </div>
    </dl>
  );
}

function Cambios({
  cambios,
  cambiados,
  accion,
}: {
  cambios: CambioAuditoria[];
  cambiados: number;
  accion: string;
}) {
  if (cambios.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este movimiento no guardó un detalle de campos — la acción quedó registrada, pero el
        servicio que la escribió no anotó valores.
      </p>
    );
  }

  // En un `crear` no hay "antes" y en un `eliminar` no hay "después": la
  // flecha sobraría en ambos, y lo que se quiere leer es la lista de
  // valores. Solo `actualizar` es de verdad una comparación.
  const comparativo = accion === "actualizar";

  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {comparativo
          ? `${cambiados} de ${cambios.length} campo${cambios.length === 1 ? "" : "s"} cambió`
          : accion === "eliminar"
            ? "Valores que tenía al eliminarse"
            : "Valores registrados"}
      </p>

      <ul className="flex flex-col gap-1.5">
        {cambios.map((c) => (
          <li
            key={c.campo}
            className={cn(
              "flex flex-col gap-x-3 gap-y-0.5 text-sm sm:flex-row sm:items-baseline",
              // Un campo que no se movió se atenúa en vez de esconderse: sin
              // él no se sabe qué NO cambió, que es la mitad de la pregunta.
              comparativo && !c.cambio && "text-muted-foreground"
            )}
          >
            <span className="shrink-0 text-xs tracking-wide text-muted-foreground uppercase sm:w-44 sm:text-sm sm:normal-case sm:tracking-normal">
              {c.etiqueta}
            </span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
              {comparativo && c.cambio ? (
                <>
                  <span className="text-muted-foreground line-through">{c.antes ?? "—"}</span>
                  <ArrowRight className="size-3 shrink-0 self-center text-muted-foreground" />
                  <span className="font-medium break-words">{c.despues ?? "—"}</span>
                </>
              ) : (
                <span className={cn("break-words", c.cambio && "font-medium")}>
                  {(accion === "eliminar" ? c.antes : (c.despues ?? c.antes)) ?? "—"}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
