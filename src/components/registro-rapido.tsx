"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Plus, X, ShoppingCart, RotateCcw, HandCoins, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CLASE_ACCESO_RAPIDO } from "@/components/acceso-rapido";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Campo } from "@/components/campo";
import { VentaForm } from "@/components/venta-form";
import { PagoForm } from "@/components/pago-form";
import { DevolucionForm } from "@/components/devolucion-form";
import {
  obtenerDatosParaRegistroAction,
  type DatosParaRegistro,
} from "@/server/actions/actividad";
import { crearVentaAction } from "@/server/actions/ventas";
import { crearPagoAction } from "@/server/actions/pagos";
import { crearDevolucionAction } from "@/server/actions/devoluciones";

type Tipo = "venta" | "pago" | "devolucion";

const TITULO_TIPO: Record<Tipo, string> = {
  venta: "Nueva venta",
  pago: "Nuevo pago",
  devolucion: "Nueva devolución",
};

// El ícono se elige AQUÍ y no se recibe como prop: este archivo es
// "use client", y un componente de lucide es una función — cruzarla desde un
// Server Component revienta en runtime ("Functions cannot be passed directly
// to Client Components"), sin que tsc, eslint ni `next build` digan nada. La
// página solo manda datos serializables (el tipo y la etiqueta).
const ICONO_TIPO: Record<Tipo, LucideIcon> = {
  venta: ShoppingCart,
  pago: HandCoins,
  devolucion: RotateCcw,
};

// El botón "+ Registrar" del feed de actividad y del dashboard. Elegir
// cliente + tipo aquí solo trae los datos de soporte que el formulario
// real necesita (obtenerDatosParaRegistroAction) — el alta en sí la hace
// el mismo VentaForm/PagoForm/DevolucionForm y la misma Server Action de
// siempre, sin reimplementar stock/saldo. Al enviar, esas acciones hacen
// redirect() a la ficha del cliente, lo que cierra el modal por sí solo.
//
// `tipoInicial` existe para los accesos rápidos del dashboard ("Nueva
// venta", "Registrar devolución"): las rutas /ventas/nueva y
// /devoluciones/nueva exigen `clienteId` y hacen notFound() sin él, así que
// desde el dashboard —donde todavía no hay cliente— no se puede enlazar a
// ellas. Este diálogo YA resuelve ese paso, así que se reusa con el tipo ya
// elegido en vez de construir una pantalla paralela.
export function RegistroRapido({
  clientes,
  tipoInicial = "venta",
  etiqueta = "Registrar",
  presentacion = "boton",
}: {
  clientes: { id: number; nombre: string }[];
  tipoInicial?: Tipo;
  etiqueta?: string;
  presentacion?: "boton" | "acceso-rapido";
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>(tipoInicial);
  const [clienteId, setClienteId] = useState("");
  const [datos, setDatos] = useState<DatosParaRegistro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!pendiente) {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }, [pendiente]);

  function reiniciar() {
    setDatos(null);
    setError(null);
    setClienteId("");
    setTipo(tipoInicial);
    setIsSubmitting(false);
    submittingRef.current = false;
  }

  function continuar() {
    if (submittingRef.current || pendiente) return;
    const idNum = Number(clienteId);
    if (!idNum) {
      setError("Elige un cliente.");
      return;
    }
    setError(null);
    submittingRef.current = true;
    setIsSubmitting(true);
    iniciarTransicion(async () => {
      try {
        const resultado = await obtenerDatosParaRegistroAction(tipo, idNum);
        setDatos(resultado);
      } catch {
        setError("No se pudo cargar la información. Intenta de nuevo.");
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    });
  }

  const clienteSeleccionado = clientes.find((c) => c.id === Number(clienteId));
  const IconoDisparador = ICONO_TIPO[tipoInicial];

  return (
    <Dialog.Root
      open={abierto}
      onOpenChange={(open) => {
        setAbierto(open);
        if (!open) reiniciar();
      }}
    >
      <Dialog.Trigger
        className={presentacion === "boton" ? buttonVariants({ size: "sm" }) : CLASE_ACCESO_RAPIDO}
      >
        {presentacion === "boton" ? (
          <Plus className="size-4" />
        ) : (
          <IconoDisparador className="size-4 text-muted-foreground" />
        )}
        {etiqueta}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border bg-card p-4 sm:p-6 text-card-foreground shadow-lg outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-heading text-lg font-semibold">
              {datos ? `${TITULO_TIPO[tipo]} — ${clienteSeleccionado?.nombre}` : "Registrar"}
            </Dialog.Title>
            <Dialog.Close className="flex size-11 sm:size-8 items-center justify-center rounded-md hover:bg-accent touch-manipulation">
              <X className="size-5" />
              <span className="sr-only">Cerrar</span>
            </Dialog.Close>
          </div>

          {!datos ? (
            <div className="flex flex-col gap-4">
              <Campo id="tipo-registro" label="Tipo">
                <Select
                  id="tipo-registro"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as Tipo)}
                >
                  <option value="venta">Venta</option>
                  <option value="pago">Abono / pago</option>
                  <option value="devolucion">Devolución</option>
                </Select>
              </Campo>
              <Campo id="cliente-registro" label="Cliente">
                <Select
                  id="cliente-registro"
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                >
                  <option value="">Selecciona...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
              {error ? <Alert variant="error">{error}</Alert> : null}
              <Button onClick={continuar} disabled={pendiente || isSubmitting} className="self-start">
                {pendiente || isSubmitting ? "Cargando…" : "Continuar"}
              </Button>
            </div>
          ) : datos.tipo === "venta" ? (
            <VentaForm
              accion={crearVentaAction}
              idCliente={Number(clienteId)}
              catalogo={datos.catalogo}
              textoBoton="Registrar venta"
            />
          ) : datos.tipo === "pago" ? (
            <PagoForm accion={crearPagoAction} idCliente={Number(clienteId)} textoBoton="Registrar pago" />
          ) : (
            <DevolucionForm
              accion={crearDevolucionAction}
              idCliente={Number(clienteId)}
              devolubles={datos.devolubles}
              textoBoton="Registrar devolución"
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
