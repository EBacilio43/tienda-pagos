"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Plus, AlertTriangle, ExternalLink } from "lucide-react";
import { generarTokenIdempotencia } from "@/lib/idempotencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Campo } from "@/components/campo";
import { Currency } from "@/components/currency";
import { PanelTabla } from "@/components/panel-tabla";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { sumarMontos, formatearMoneda } from "@/lib/money";
import { calcularSaldosEnCascada, esMontoValido } from "@/lib/abonos-cascada";
import { hoyEnElNavegador } from "@/lib/fecha";
import { LOTE_MAXIMO, METODOS_PAGO, METODO_PAGO_POR_DEFECTO } from "@/lib/schemas/pago";
import {
  crearPagosEnLoteAction,
  revisarDuplicadosAction,
  type FilaLote,
} from "@/server/actions/pagos";

export type ClienteCaptura = { id: number; nombre: string; saldo: string };

type Fila = {
  clave: number;
  idCliente: string; // string: viene de un <select>, "" = sin elegir
  monto: string;
  fecha: string;
  metodoPago: string;
};

let contadorClaves = 0;
function filaVacia(fecha: string): Fila {
  contadorClaves += 1;
  return {
    clave: contadorClaves,
    idCliente: "",
    monto: "",
    fecha,
    metodoPago: METODO_PAGO_POR_DEFECTO,
  };
}

function montoValido(monto: string): boolean {
  return esMontoValido(monto);
}

// Misma clave que claveDuplicado() del servicio — si una cambia, la otra
// deja de cruzar y el aviso se apaga en silencio.
function claveFila(f: Fila): string {
  return `${Number(f.idCliente)}|${f.fecha}|${f.monto.trim()}`;
}

export function CapturaAbonos({
  clientes,
  preseleccionados,
}: {
  clientes: ClienteCaptura[];
  preseleccionados: number[];
}) {
  const router = useRouter();
  const hoy = hoyEnElNavegador();

  const [fechaComun, setFechaComun] = useState(hoy);
  const [filas, setFilas] = useState<Fila[]>(() => {
    const iniciales = preseleccionados.map((id) => ({ ...filaVacia(hoy), idCliente: String(id) }));
    return [...iniciales, filaVacia(hoy)];
  });
  const [duplicados, setDuplicados] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filaConError, setFilaConError] = useState<number | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [idempotencyToken] = useState(() => generarTokenIdempotencia());

  useEffect(() => {
    if (!pendiente) {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [pendiente]);

  const nombrePorCliente = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nombre])),
    [clientes]
  );

  const saldoPorCliente = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.saldo])),
    [clientes]
  );

  // Un renglón cuenta cuando tiene cliente y un monto válido; el último
  // renglón vacío es andamiaje de captura, no un abono a medias.
  const completas = filas.filter((f) => f.idCliente !== "" && montoValido(f.monto));
  const total = completas.length
    ? sumarMontos(...completas.map((f) => f.monto.trim()))
    : "0.00";

  function actualizar(clave: number, cambio: Partial<Fila>) {
    setDuplicados(null);
    setError(null);
    setFilaConError(null);
    setFilas((prev) => {
      const siguiente = prev.map((f) => (f.clave === clave ? { ...f, ...cambio } : f));
      // Renglón nuevo automático: llenar el último deja otro listo, para no
      // tener que ir al botón "Agregar" entre abono y abono.
      const ultima = siguiente[siguiente.length - 1];
      if (ultima.idCliente !== "" && siguiente.length < LOTE_MAXIMO) {
        siguiente.push(filaVacia(fechaComun));
      }
      return siguiente;
    });
  }

  function eliminar(clave: number) {
    setDuplicados(null);
    setFilas((prev) => {
      const siguiente = prev.filter((f) => f.clave !== clave);
      return siguiente.length ? siguiente : [filaVacia(fechaComun)];
    });
  }

  function aplicarFechaATodas(fecha: string) {
    setFechaComun(fecha);
    setDuplicados(null);
    setFilas((prev) => prev.map((f) => ({ ...f, fecha })));
  }

  function aFilaLote(f: Fila): FilaLote {
    return {
      idCliente: Number(f.idCliente),
      fecha: f.fecha,
      monto: f.monto.trim(),
      metodoPago: f.metodoPago.trim() || undefined,
    };
  }

  function registrar() {
    if (submittingRef.current || pendiente) return;
    setError(null);
    setFilaConError(null);

    if (completas.length === 0) {
      setError("Captura al menos un abono con cliente y monto.");
      return;
    }
    const incompleta = filas.findIndex(
      (f) => (f.idCliente !== "" || f.monto.trim() !== "") && !(f.idCliente !== "" && montoValido(f.monto))
    );
    if (incompleta !== -1) {
      setFilaConError(incompleta);
      setError(`Renglón ${incompleta + 1}: falta el cliente o el monto no es válido.`);
      return;
    }

    const payload = completas.map(aFilaLote);
    submittingRef.current = true;
    setIsSubmitting(true);

    iniciarTransicion(async () => {
      try {
        // Primer intento: se revisan duplicados y, si los hay, no se guarda
        // todavía — se avisa. El segundo clic ya viene con `duplicados`
        // puesto y procede.
        if (duplicados === null) {
          const encontrados = await revisarDuplicadosAction(payload);
          if (encontrados.length > 0) {
            setDuplicados(new Set(encontrados));
            submittingRef.current = false;
            setIsSubmitting(false);
            return;
          }
          setDuplicados(new Set());
        }

        const resultado = await crearPagosEnLoteAction(payload, idempotencyToken);
        if (!resultado.ok) {
          setError(resultado.mensaje);
          if (resultado.fila !== undefined) setFilaConError(resultado.fila);
          setDuplicados(null);
          submittingRef.current = false;
          setIsSubmitting(false);
          return;
        }
        router.push("/actividad");
        router.refresh();
      } catch {
        setError("Ocurrió un error inesperado al registrar los pagos.");
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  }

  const filasDuplicadas = duplicados
    ? filas.filter((f) => f.idCliente !== "" && montoValido(f.monto) && duplicados.has(claveFila(f)))
    : [];
  const hayAviso = filasDuplicadas.length > 0;

  const calculosCascada = useMemo(
    () => calcularSaldosEnCascada(filas, saldoPorCliente),
    [filas, saldoPorCliente]
  );

  // Lo que la tabla y las tarjetas necesitan calcular igual. Integra la
  // cascada proyectada de saldos por cliente y el aviso de duplicados.
  function calcularRenglon(f: Fila, indice: number) {
    const cascada = calculosCascada[indice];
    return {
      indice,
      ...cascada,
      esDuplicado: Boolean(
        duplicados?.has(claveFila(f)) && f.idCliente !== "" && montoValido(f.monto)
      ),
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo id="fecha-comun" label="Fecha de los abonos" ayuda="Se aplica a todos los renglones">
          <Input
            id="fecha-comun"
            type="date"
            value={fechaComun}
            onChange={(e) => aplicarFechaATodas(e.target.value)}
            className="w-44"
          />
        </Campo>
        <p className="pb-1.5 text-sm text-muted-foreground">
          Cada renglón puede llevar su propia fecha si se cobró otro día.
        </p>
      </div>

      {/* Dos presentaciones del MISMO estado, no dos formularios: los
          controles salen de los mismos helpers de abajo, así que un cambio
          en la validación o en el aria-label aplica a las dos por
          construcción.

          La retícula de 7 columnas pide ~920 px; en un teléfono eso es
          scroll horizontal mientras se teclea, y esta es justo la pantalla
          que se usa en la calle capturando cobros. Por debajo de `lg` cada
          renglón es una tarjeta apilada. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {filas.map((f, i) => {
          const calc = calcularRenglon(f, i);
          return (
            <div
              key={f.clave}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-card p-3",
                filaConError === i && "border-destructive bg-destructive/10"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <SelectCliente fila={f} indice={i} clientes={clientes} actualizar={actualizar} />
                </div>
                <EnlaceCliente fila={f} nombrePorCliente={nombrePorCliente} />
                <BotonQuitar indice={i} onQuitar={() => eliminar(f.clave)} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Campo id={`monto-movil-${f.clave}`} label="Monto">
                  <InputMonto
                    id={`monto-movil-${f.clave}`}
                    fila={f}
                    indice={i}
                    actualizar={actualizar}
                  />
                </Campo>
                <Campo id={`metodo-movil-${f.clave}`} label="Método">
                  <SelectMetodo
                    id={`metodo-movil-${f.clave}`}
                    fila={f}
                    indice={i}
                    actualizar={actualizar}
                  />
                </Campo>
                <Campo id={`fecha-movil-${f.clave}`} label="Fecha" className="col-span-2">
                  <InputFecha
                    id={`fecha-movil-${f.clave}`}
                    fila={f}
                    indice={i}
                    actualizar={actualizar}
                  />
                </Campo>
              </div>

              <div className="flex items-start justify-between gap-2 border-t pt-2 text-sm">
                <span className="text-xs tracking-wide text-muted-foreground uppercase pt-0.5">Saldo</span>
                <Saldo {...calc} />
              </div>
            </div>
          );
        })}
      </div>

      <PanelTabla className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead className="min-w-48">Cliente</TableHead>
              <TableHead className="w-36 text-right">Monto</TableHead>
              <TableHead className="w-40">Fecha</TableHead>
              <TableHead className="w-36">Método</TableHead>
              <TableHead className="w-56 text-right">Saldo</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f, i) => {
              const calc = calcularRenglon(f, i);

              return (
                <TableRow key={f.clave} className={filaConError === i ? "bg-destructive/10" : undefined}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        <SelectCliente
                          fila={f}
                          indice={i}
                          clientes={clientes}
                          actualizar={actualizar}
                        />
                      </div>
                      <EnlaceCliente fila={f} nombrePorCliente={nombrePorCliente} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <InputMonto fila={f} indice={i} actualizar={actualizar} />
                  </TableCell>
                  <TableCell>
                    <InputFecha fila={f} indice={i} actualizar={actualizar} />
                  </TableCell>
                  <TableCell>
                    <SelectMetodo fila={f} indice={i} actualizar={actualizar} />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Saldo {...calc} />
                  </TableCell>
                  <TableCell>
                    <BotonQuitar indice={i} onQuitar={() => eliminar(f.clave)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </PanelTabla>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFilas((prev) => [...prev, filaVacia(fechaComun)])}
          disabled={filas.length >= LOTE_MAXIMO}
        >
          <Plus className="size-4" />
          Agregar renglón
        </Button>
        <p className="text-sm">
          <span className="text-muted-foreground">Total a registrar: </span>
          <span className="font-heading text-xl font-bold">
            <Currency value={total} tono="abono" />
          </span>
          <span className="text-muted-foreground">
            {" "}
            en {completas.length} abono{completas.length === 1 ? "" : "s"}
          </span>
        </p>
      </div>

      {hayAviso ? (
        <Alert variant="aviso">
          {filasDuplicadas.length === 1
            ? "Un abono ya existe con el mismo cliente, fecha y monto."
            : `${filasDuplicadas.length} abonos ya existen con el mismo cliente, fecha y monto.`}{" "}
          Puede ser una recaptura por error, o un cobro real repetido — el sistema no puede
          distinguirlos. Revisa los renglones marcados; si están bien, vuelve a darle a registrar.
        </Alert>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div>
        <Button
          type="button"
          onClick={registrar}
          disabled={pendiente || isSubmitting || completas.length === 0}
        >
          {pendiente || isSubmitting
            ? "Guardando…"
            : hayAviso
              ? `Registrar de todos modos (${completas.length})`
              : `Registrar ${completas.length} abono${completas.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------
// Controles compartidos por la tabla (lg+) y las tarjetas (móvil). El
// motivo de extraerlos no es estético: sin ellos, dos copias del mismo
// <Select> con el mismo aria-label se separan en el primer cambio, y la
// que nadie mira en el escritorio es justo la del teléfono.
// ---------------------------------------------------------------------

type PropsControlFila = {
  fila: Fila;
  indice: number;
  actualizar: (clave: number, cambio: Partial<Fila>) => void;
  /**
   * Solo lo pasa la tarjeta móvil, que sí tiene un <Label> visible al lado
   * (vía <Campo>). Su presencia apaga el `aria-label`: dos mecanismos de
   * etiquetado sobre el mismo control se pisan, y el aria-label gana
   * silenciosamente sobre la etiqueta que la persona está viendo. En la
   * tabla no hay dónde poner un <Label> por celda, y ahí el aria-label es
   * la única etiqueta que existe.
   */
  id?: string;
};

function SelectCliente({
  fila,
  indice,
  clientes,
  actualizar,
  id,
}: PropsControlFila & { clientes: ClienteCaptura[] }) {
  return (
    <Select
      id={id}
      value={fila.idCliente}
      onChange={(e) => actualizar(fila.clave, { idCliente: e.target.value })}
      aria-label={id ? undefined : `Cliente del renglón ${indice + 1}`}
    >
      <option value="">Selecciona…</option>
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </Select>
  );
}

function EnlaceCliente({
  fila,
  nombrePorCliente,
}: {
  fila: Fila;
  nombrePorCliente: Map<number, string>;
}) {
  if (!fila.idCliente) return null;
  return (
    <Link
      href={`/clientes/${fila.idCliente}`}
      target="_blank"
      rel="noopener"
      title="Ver la cuenta completa en una pestaña nueva"
      aria-label={`Ver la cuenta completa de ${nombrePorCliente.get(Number(fila.idCliente)) ?? "el cliente"} en una pestaña nueva`}
      className="flex size-11 sm:size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground touch-manipulation"
    >
      <ExternalLink className="size-4" />
    </Link>
  );
}

function InputMonto({ fila, indice, actualizar, id }: PropsControlFila) {
  return (
    <Input
      id={id}
      value={fila.monto}
      onChange={(e) => actualizar(fila.clave, { monto: e.target.value })}
      placeholder="0.00"
      inputMode="decimal"
      className="text-right tabular-nums"
      aria-label={id ? undefined : `Monto del renglón ${indice + 1}`}
      aria-invalid={fila.monto.trim() !== "" && !montoValido(fila.monto)}
    />
  );
}

function InputFecha({ fila, indice, actualizar, id }: PropsControlFila) {
  return (
    <Input
      id={id}
      type="date"
      value={fila.fecha}
      onChange={(e) => actualizar(fila.clave, { fecha: e.target.value })}
      aria-label={id ? undefined : `Fecha del renglón ${indice + 1}`}
    />
  );
}

function SelectMetodo({ fila, indice, actualizar, id }: PropsControlFila) {
  return (
    <Select
      id={id}
      value={fila.metodoPago}
      onChange={(e) => actualizar(fila.clave, { metodoPago: e.target.value })}
      aria-label={id ? undefined : `Método del renglón ${indice + 1}`}
    >
      {METODOS_PAGO.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </Select>
  );
}

function BotonQuitar({ indice, onQuitar }: { indice: number; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={`Quitar renglón ${indice + 1}`}
      className="flex size-11 sm:size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground touch-manipulation"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function Saldo({
  saldoAnterior,
  resultante,
  esDuplicado,
  indiceEnCliente = 1,
  totalAbonosCliente = 1,
  montoTotalCliente,
  saldoFinalCliente,
  superaSaldo = false,
  totalSuperaSaldo = false,
}: {
  indice: number;
  saldoAnterior?: string;
  resultante?: string;
  esDuplicado: boolean;
  indiceEnCliente?: number;
  totalAbonosCliente?: number;
  montoTotalCliente?: string;
  saldoFinalCliente?: string;
  superaSaldo?: boolean;
  totalSuperaSaldo?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      {saldoAnterior === undefined ? (
        <span className="text-muted-foreground">—</span>
      ) : resultante === undefined ? (
        <Currency value={saldoAnterior} tono="saldo" />
      ) : (
        <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <span className="text-muted-foreground line-through">
            <Currency value={saldoAnterior} tono="neutro" />
          </span>
          <span aria-hidden>→</span>
          <Currency value={resultante} tono="saldo" />
        </span>
      )}
      {totalAbonosCliente > 1 ? (
        <Badge
          variant={totalSuperaSaldo ? "destructive" : "outline"}
          className="h-4 px-1.5 text-[10px] font-medium"
          title={
            montoTotalCliente
              ? `Total cliente en lote: ${formatearMoneda(montoTotalCliente)}${
                  saldoFinalCliente ? ` · Saldo final: ${formatearMoneda(saldoFinalCliente)}` : ""
                }`
              : undefined
          }
        >
          Abono {indiceEnCliente} de {totalAbonosCliente}
        </Badge>
      ) : null}
      {superaSaldo ? (
        <span className="flex items-center justify-end gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3 shrink-0" />
          Supera saldo adeudado
        </span>
      ) : totalSuperaSaldo ? (
        <span className="flex items-center justify-end gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3 shrink-0" />
          Total acumulado supera saldo
        </span>
      ) : null}
      {esDuplicado ? (
        <span className="flex items-center justify-end gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3 shrink-0" />
          Ya existe uno igual
        </span>
      ) : null}
    </div>
  );
}
