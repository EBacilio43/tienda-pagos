import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ShoppingCart, HandCoins, ArrowDownToLine, RotateCcw, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Currency, type TonoMonto } from "@/components/currency";
import { Fecha } from "@/components/fecha";
import { EstadoVacio } from "@/components/estado-vacio";
import {
  obtenerClienteDetalle,
  listarVentasCliente,
  listarPagosCliente,
  listarDevolucionesCliente,
} from "@/server/services/clientes";
import { obtenerResumenSaldo } from "@/server/services/saldo";
import { obtenerLedgerCliente } from "@/server/services/estado-cuenta";
import { leerSesion } from "@/server/auth/session";
import {
  puedeCrearEditarClientes,
  puedeEliminarClientes,
  puedeGestionarTransacciones,
} from "@/lib/permisos";
import { buttonVariants } from "@/components/ui/button";
import { BotonConfirmarAccion } from "@/components/boton-confirmar-accion";
import { PageHeader } from "@/components/page-header";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaActividad } from "@/components/fila-actividad";
import { DesgloseArticulos } from "@/components/desglose-articulos";
import { PrevisualizarEstadoCuenta } from "@/components/previsualizar-estado-cuenta";
import { hrefDetalleMovimiento } from "@/lib/movimientos";
import { eliminarClienteAction } from "@/server/actions/clientes";
import { eliminarVentaAction } from "@/server/actions/ventas";
import { eliminarPagoAction } from "@/server/actions/pagos";
import { eliminarDevolucionAction } from "@/server/actions/devoluciones";
import type { Rol } from "@/types/dominio";

// `corta` no es una abreviatura por gusto: las cuatro etiquetas largas
// suman ~330 px más su padding, así que en un teléfono la última pestaña
// quedaba fuera de vista y solo se llegaba a ella deslizando una barra que
// no anuncia que se puede deslizar. Con las cortas caben las cuatro.
const TABS = [
  { valor: "general", etiqueta: "Vista General", corta: "General" },
  { valor: "ventas", etiqueta: "Ventas / Compras", corta: "Ventas" },
  { valor: "pagos", etiqueta: "Abonos / Pagos", corta: "Abonos" },
  { valor: "devoluciones", etiqueta: "Devoluciones", corta: "Devoluciones" },
] as const;

type Tab = (typeof TABS)[number]["valor"];

export default async function ClienteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId)) notFound();

  const [cliente, resumen, usuario, searchParamsResolved] = await Promise.all([
    obtenerClienteDetalle(clienteId),
    obtenerResumenSaldo(clienteId),
    leerSesion(),
    searchParams,
  ]);
  if (!cliente) notFound();

  const tab = searchParamsResolved.tab;
  const tabActivo: Tab = TABS.some((t) => t.valor === tab) ? (tab as Tab) : "general";

  const rol = usuario?.rol as Rol | undefined;
  const puedeEditarCliente = rol ? puedeCrearEditarClientes(rol) : false;
  const puedeEliminar = rol ? puedeEliminarClientes(rol) : false;
  const puedeGestionar = rol ? puedeGestionarTransacciones(rol) : false;

  return (
    <div>
      <PageHeader
        titulo={`Estado de Cuenta: ${cliente.nombre}`}
        acciones={
          <>
            <PrevisualizarEstadoCuenta
              clientes={[{ id: clienteId, nombre: cliente.nombre }]}
              etiqueta="Ver PDF"
            />
            <a
              href={`/api/reportes/estado-cuenta?clienteId=${clienteId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Descargar PDF
            </a>
            {puedeEditarCliente ? (
              <Link
                href={`/clientes/${clienteId}/editar`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Editar
              </Link>
            ) : null}
            {puedeEliminar ? (
              <BotonConfirmarAccion
                etiqueta="Eliminar cliente"
                etiquetaPendiente="Eliminando…"
                titulo={`Eliminar a "${cliente.nombre}"`}
                descripcion="Esta acción no se puede deshacer."
                accion={eliminarClienteAction.bind(null, clienteId)}
              />
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResumenItem
          etiqueta="Total Ventas"
          valor={resumen.totalVentas}
          icono={ShoppingCart}
          tono="venta"
          claseBorde="border-venta"
          claseIcono="bg-venta/10 text-venta"
        />
        <ResumenItem
          etiqueta="Enganches"
          valor={resumen.totalEnganches}
          icono={HandCoins}
          tono="enganche"
          signo="menos"
          claseBorde="border-enganche"
          claseIcono="bg-enganche/10 text-enganche"
        />
        <ResumenItem
          etiqueta="Abonos"
          valor={resumen.totalPagos}
          icono={ArrowDownToLine}
          tono="abono"
          signo="menos"
          claseBorde="border-abono"
          claseIcono="bg-abono/10 text-abono"
        />
        <ResumenItem
          etiqueta="Monto Devuelto"
          valor={resumen.totalDevoluciones}
          icono={RotateCcw}
          tono="devolucion"
          signo="menos"
          claseBorde="border-devolucion"
          claseIcono="bg-devolucion/10 text-devolucion"
        />
      </div>

      {/* Saldo Pendiente sale de la retícula: es la respuesta que se vino
          a buscar, y "= Saldo Pendiente" cierra la resta que arrancó
          arriba (Total − Enganches − Abonos − Monto Devuelto). */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border-l-4 border-saldo bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-saldo/10 text-saldo">
          <Scale className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            = Saldo Pendiente
          </p>
          <p className="text-2xl font-bold">
            <Currency value={resumen.saldo} tono="saldo" />
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.valor}
            href={`/clientes/${clienteId}?tab=${t.valor}`}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium sm:px-4",
              t.valor === tabActivo
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="sm:hidden">{t.corta}</span>
            <span className="hidden sm:inline">{t.etiqueta}</span>
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {tabActivo === "general" && <TabGeneral clienteId={clienteId} />}
        {tabActivo === "ventas" && (
          <TabVentas clienteId={clienteId} puedeGestionar={puedeGestionar} />
        )}
        {tabActivo === "pagos" && (
          <TabPagos clienteId={clienteId} puedeGestionar={puedeGestionar} />
        )}
        {tabActivo === "devoluciones" && (
          <TabDevoluciones clienteId={clienteId} puedeGestionar={puedeGestionar} />
        )}
      </div>
    </div>
  );
}

// Fase 9 / ADR-17. El único diferenciador de los 4 ítems solía ser el hue
// del texto — invisible en escala de grises o con deuteranopia. Ahora hay
// tres señales redundantes: la barra de color a la izquierda, el ícono, y
// el signo aritmético (Total − Enganches − Abonos − Devuelto = Saldo, la
// misma resta que ya hace el PDF).
function ResumenItem({
  etiqueta,
  valor,
  icono: Icono,
  tono,
  signo = "ninguno",
  claseBorde,
  claseIcono,
}: {
  etiqueta: string;
  valor: string;
  icono: LucideIcon;
  tono: TonoMonto;
  signo?: "ninguno" | "menos";
  claseBorde: string;
  claseIcono: string;
}) {
  return (
    // Apilado en móvil: a dos columnas la celda mide ~158 px, y con el
    // ícono al lado le quedan ~90 al monto — "$87,000.00" (el mayor real
    // hoy) pide ~110 y se salía. Poniendo el ícono arriba, el número tiene
    // el ancho completo de la tarjeta y las tres señales redundantes
    // (color, ícono, signo) siguen las tres presentes.
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-lg border-l-4 bg-muted p-3 sm:flex-row sm:items-center sm:gap-3",
        claseBorde
      )}
    >
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", claseIcono)}>
        <Icono className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
        <p className="text-lg font-bold">
          <Currency value={valor} tono={tono} signo={signo} />
        </p>
      </div>
    </div>
  );
}

const TIPO_ETIQUETA: Record<string, string> = {
  venta: "Venta",
  enganche: "Enganche",
  pago: "Abono",
  devolucion: "Devolución",
};

const TIPO_VARIANTE: Record<string, "venta" | "enganche" | "abono" | "devolucion"> = {
  venta: "venta",
  enganche: "enganche",
  pago: "abono",
  devolucion: "devolucion",
};

async function TabGeneral({ clienteId }: { clienteId: number }) {
  const movimientos = await obtenerLedgerCliente(clienteId);

  if (movimientos.length === 0) {
    return <EstadoVacio titulo="Sin movimientos registrados" />;
  }

  return (
    <>
      {/* El ledger tiene 7 columnas y dos de ellas son texto libre
          (descripción y detalle), así que en un teléfono no hay recorte de
          columnas que lo salve: pedía ~800 px y obligaba a hacer scroll
          horizontal para llegar al saldo, que es justo la columna que se
          viene a leer. Debajo de `lg` cada movimiento es una tarjeta.

          Aquí la tarjeta SÍ puede ser un <a> de verdad, a diferencia de la
          tabla: <a> no puede envolver un <tr> (HTML inválido) y por eso las
          filas navegan imperativamente vía <FilaActividad>. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {movimientos.map((m) => (
          <Link
            key={m.id}
            href={hrefDetalleMovimiento(m.id, m.tipo)}
            className="block rounded-xl border bg-card p-3 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge variant={TIPO_VARIANTE[m.tipo] ?? "outline"}>{TIPO_ETIQUETA[m.tipo]}</Badge>
              <Fecha value={m.fecha} formato="largo" className="text-sm text-muted-foreground" />
            </div>

            {/* break-words y no truncate: la descripción de una venta es la
                lista de piezas, y cortarla en "1x Par de arracadas fac…"
                esconde justo lo que distingue un movimiento de otro. */}
            <p className="mt-2 text-sm font-medium break-words">{m.descripcion || "—"}</p>
            {m.detalle ? (
              <p className="text-xs break-words text-muted-foreground">{m.detalle}</p>
            ) : null}

            {m.articulos.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
                {m.articulos.map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {a.cantidad}x {a.nombre}
                      {a.precioUnitario ? (
                        <>
                          {" · "}
                          <Currency value={a.precioUnitario} tono="neutro" /> c/u
                        </>
                      ) : null}
                    </span>
                    {a.subtotal ? (
                      <Currency value={a.subtotal} tono="neutro" className="shrink-0" />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Cargo y abono nunca conviven en un movimiento (lo garantiza
                construirLedger: una venta trae cargo, todo lo demás abono),
                así que en la tarjeta se muestra el que exista con su
                etiqueta, en vez de dos columnas y un guion. El saldo va al
                lado porque es el número por el que se abre esta pantalla. */}
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-2">
              <span className="text-sm">
                <span className="text-xs tracking-wide text-muted-foreground uppercase">
                  {m.cargo ? "Cargo " : "Abono "}
                </span>
                <span className="font-semibold">
                  {m.cargo ? (
                    <Currency value={m.cargo} tono="saldo" />
                  ) : (
                    <Currency value={m.abono ?? "0.00"} tono="abono" />
                  )}
                </span>
              </span>
              <span className="text-sm">
                <span className="text-xs tracking-wide text-muted-foreground uppercase">Saldo </span>
                <span className="font-medium">
                  <Currency value={m.saldoAcumulado} tono="neutro" />
                </span>
              </span>
            </div>
          </Link>
        ))}
      </div>

      <PanelTabla className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead className="text-right">Cargo</TableHead>
              <TableHead className="text-right">Abono</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos.map((m) => (
              <Fragment key={m.id}>
                {/* Sin borde inferior cuando el movimiento trae desglose: la
                    raya iría entre la venta y sus propias piezas, separando lo
                    que forma un solo bloque. La cierra el último renglón. */}
                <FilaActividad
                  href={hrefDetalleMovimiento(m.id, m.tipo)}
                  className={m.articulos.length > 0 ? "border-0" : undefined}
                >
                  <TableCell>
                    <Fecha value={m.fecha} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={TIPO_VARIANTE[m.tipo] ?? "outline"}>
                      {TIPO_ETIQUETA[m.tipo]}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.descripcion || "—"}</TableCell>
                  <TableCell>{m.detalle || "—"}</TableCell>
                  <TableCell className="text-right">
                    {m.cargo ? <Currency value={m.cargo} tono="saldo" /> : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.abono ? <Currency value={m.abono} tono="abono" /> : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Currency value={m.saldoAcumulado} tono="neutro" />
                  </TableCell>
                </FilaActividad>
                {m.articulos.map((a, i) => (
                  <TableRow
                    key={`${m.id}-${i}`}
                    className={i < m.articulos.length - 1 ? "border-0" : undefined}
                  >
                    <TableCell colSpan={2} />
                    <TableCell colSpan={2} className="pl-6 text-xs text-muted-foreground">
                      {a.cantidad}x {a.nombre}
                      {a.precioUnitario ? (
                        <>
                          {" · "}
                          <Currency value={a.precioUnitario} tono="neutro" /> c/u
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {m.cargo && a.subtotal ? <Currency value={a.subtotal} tono="neutro" /> : null}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {m.abono && a.subtotal ? <Currency value={a.subtotal} tono="neutro" /> : null}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </PanelTabla>
    </>
  );
}

// Envoltura común de las tres pestañas de movimientos en móvil. No abarca
// TabGeneral: aquella tarjeta es un enlace entero (el ledger no tiene
// acciones por fila), y ésta lleva botones dentro, así que envolverla en un
// <a> anidaría controles interactivos dentro de un enlace — HTML inválido.
function TarjetaMovimiento({
  fecha,
  monto,
  etiquetaMonto,
  contexto,
  desglose,
  acciones,
}: {
  fecha: string;
  monto: ReactNode;
  etiquetaMonto: string;
  contexto?: ReactNode;
  desglose?: ReactNode;
  acciones: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Fecha value={fecha} formato="largo" className="text-sm text-muted-foreground" />
        <span className="text-sm">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            {etiquetaMonto}{" "}
          </span>
          <span className="font-semibold">{monto}</span>
        </span>
      </div>

      {contexto ? <div className="mt-1 text-xs text-muted-foreground">{contexto}</div> : null}

      {desglose ? (
        <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">{desglose}</div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2 text-xs">
        {acciones}
      </div>
    </div>
  );
}

function AccionesVenta({
  venta,
  clienteId,
  puedeGestionar,
}: {
  venta: { id: number };
  clienteId: number;
  puedeGestionar: boolean;
}) {
  return (
    <>
      <Link href={`/ventas/${venta.id}`} className="text-xs hover:underline">
        Ver
      </Link>
      {puedeGestionar ? (
        <>
          <Link href={`/ventas/${venta.id}/editar`} className="text-xs hover:underline">
            Editar
          </Link>
          <BotonConfirmarAccion
            etiqueta="Eliminar"
            etiquetaPendiente="Eliminando…"
            presentacion="enlace"
            titulo="Eliminar esta venta"
            descripcion="Repone el stock de sus artículos. Esta acción no se puede deshacer."
            accion={eliminarVentaAction.bind(null, venta.id, clienteId)}
          />
        </>
      ) : null}
    </>
  );
}

async function TabVentas({
  clienteId,
  puedeGestionar,
}: {
  clienteId: number;
  puedeGestionar: boolean;
}) {
  const ventas = await listarVentasCliente(clienteId);

  return (
    <div>
      {puedeGestionar ? (
        <Link
          href={`/ventas/nueva?clienteId=${clienteId}`}
          className={buttonVariants({ size: "sm" })}
        >
          Nueva venta
        </Link>
      ) : null}

      {ventas.length === 0 ? (
        <EstadoVacio titulo="Sin ventas registradas" className="mt-4" />
      ) : (
        <>
          {/* Seis columnas, una de ellas el desglose de piezas y otra tres
              acciones que no envuelven: ~560 px contra los 328 del
              teléfono. Debajo de `lg`, una tarjeta por venta. */}
          <div className="mt-4 flex flex-col gap-2 lg:hidden">
            {ventas.map((v) => (
              <TarjetaMovimiento
                key={v.id}
                fecha={v.fecha}
                etiquetaMonto="Total"
                monto={<Currency value={v.montoTotal} />}
                contexto={
                  <>
                    {v.esquemaPago ?? "Sin especificar"}
                    {v.tieneEnganche && v.enganche ? (
                      <>
                        {" · enganche "}
                        <Currency value={v.enganche} tono="enganche" />
                      </>
                    ) : null}
                  </>
                }
                desglose={<DesgloseArticulos articulos={v.articulos} />}
                acciones={
                  <AccionesVenta venta={v} clienteId={clienteId} puedeGestionar={puedeGestionar} />
                }
              />
            ))}
          </div>

          <PanelTabla className="mt-4 hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead>Esquema</TableHead>
                  <TableHead className="text-right">Enganche</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Fecha value={v.fecha} />
                    </TableCell>
                    <TableCell>
                      <DesgloseArticulos articulos={v.articulos} />
                    </TableCell>
                    <TableCell>{v.esquemaPago ?? "Sin especificar"}</TableCell>
                    <TableCell className="text-right">
                      {v.tieneEnganche && v.enganche ? <Currency value={v.enganche} /> : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Currency value={v.montoTotal} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-3">
                        <AccionesVenta
                          venta={v}
                          clienteId={clienteId}
                          puedeGestionar={puedeGestionar}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelTabla>
        </>
      )}
    </div>
  );
}

function AccionesPago({
  pago,
  clienteId,
  puedeGestionar,
}: {
  pago: { id: number };
  clienteId: number;
  puedeGestionar: boolean;
}) {
  return (
    <>
      <Link href={`/pagos/${pago.id}`} className="text-xs hover:underline">
        Ver
      </Link>
      {puedeGestionar ? (
        <>
          <Link href={`/pagos/${pago.id}/editar`} className="text-xs hover:underline">
            Editar
          </Link>
          <BotonConfirmarAccion
            etiqueta="Eliminar"
            etiquetaPendiente="Eliminando…"
            presentacion="enlace"
            titulo="Eliminar este pago"
            descripcion="Esta acción no se puede deshacer."
            accion={eliminarPagoAction.bind(null, pago.id, clienteId)}
          />
        </>
      ) : null}
    </>
  );
}

async function TabPagos({
  clienteId,
  puedeGestionar,
}: {
  clienteId: number;
  puedeGestionar: boolean;
}) {
  const pagos = await listarPagosCliente(clienteId);

  return (
    <div>
      {puedeGestionar ? (
        <Link
          href={`/pagos/nuevo?clienteId=${clienteId}`}
          className={buttonVariants({ size: "sm" })}
        >
          Nuevo pago
        </Link>
      ) : null}

      {pagos.length === 0 ? (
        <EstadoVacio titulo="Sin pagos registrados" className="mt-4" />
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 lg:hidden">
            {pagos.map((p) => (
              <TarjetaMovimiento
                key={p.id}
                fecha={p.fecha}
                etiquetaMonto="Monto"
                monto={<Currency value={p.monto} tono="abono" />}
                contexto={
                  <>
                    {p.metodoPago ?? "Sin método"}
                    {p.referencia ? ` · ref. ${p.referencia}` : null}
                  </>
                }
                acciones={
                  <AccionesPago pago={p} clienteId={clienteId} puedeGestionar={puedeGestionar} />
                }
              />
            ))}
          </div>

          <PanelTabla className="mt-4 hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Fecha value={p.fecha} />
                    </TableCell>
                    <TableCell>{p.metodoPago ?? "—"}</TableCell>
                    <TableCell>{p.referencia ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      <Currency value={p.monto} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-3">
                        <AccionesPago
                          pago={p}
                          clienteId={clienteId}
                          puedeGestionar={puedeGestionar}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelTabla>
        </>
      )}
    </div>
  );
}

function AccionesDevolucion({
  devolucion,
  clienteId,
  puedeGestionar,
}: {
  devolucion: { id: number };
  clienteId: number;
  puedeGestionar: boolean;
}) {
  return (
    <>
      <Link href={`/devoluciones/${devolucion.id}`} className="text-xs hover:underline">
        Ver
      </Link>
      {puedeGestionar ? (
        <>
          <Link href={`/devoluciones/${devolucion.id}/editar`} className="text-xs hover:underline">
            Editar
          </Link>
          <BotonConfirmarAccion
            etiqueta="Eliminar"
            etiquetaPendiente="Eliminando…"
            presentacion="enlace"
            titulo="Eliminar esta devolución"
            descripcion="Retira el stock repuesto. Esta acción no se puede deshacer."
            accion={eliminarDevolucionAction.bind(null, devolucion.id, clienteId)}
          />
        </>
      ) : null}
    </>
  );
}

async function TabDevoluciones({
  clienteId,
  puedeGestionar,
}: {
  clienteId: number;
  puedeGestionar: boolean;
}) {
  const devoluciones = await listarDevolucionesCliente(clienteId);

  return (
    <div>
      {puedeGestionar ? (
        <Link
          href={`/devoluciones/nueva?clienteId=${clienteId}`}
          className={buttonVariants({ size: "sm" })}
        >
          Nueva devolución
        </Link>
      ) : null}

      {devoluciones.length === 0 ? (
        <EstadoVacio titulo="Sin devoluciones registradas" className="mt-4" />
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 lg:hidden">
            {devoluciones.map((d) => (
              <TarjetaMovimiento
                key={d.id}
                fecha={d.fecha}
                etiquetaMonto="Crédito"
                monto={<Currency value={d.montoCredito} tono="devolucion" />}
                contexto={d.motivo ?? "Sin motivo anotado"}
                desglose={<DesgloseArticulos articulos={d.articulos} />}
                acciones={
                  <AccionesDevolucion
                    devolucion={d}
                    clienteId={clienteId}
                    puedeGestionar={puedeGestionar}
                  />
                }
              />
            ))}
          </div>

          <PanelTabla className="mt-4 hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devoluciones.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Fecha value={d.fecha} />
                    </TableCell>
                    <TableCell>
                      <DesgloseArticulos articulos={d.articulos} />
                    </TableCell>
                    <TableCell>{d.motivo ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      <Currency value={d.montoCredito} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-3">
                        <AccionesDevolucion
                          devolucion={d}
                          clienteId={clienteId}
                          puedeGestionar={puedeGestionar}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelTabla>
        </>
      )}
    </div>
  );
}
