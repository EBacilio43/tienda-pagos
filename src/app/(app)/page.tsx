import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  ShoppingCart,
  Boxes,
  Scale,
  ChevronRight,
  Plus,
  Package,
  ScrollText,
  HandCoins,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Currency } from "@/components/currency";
import { Fecha } from "@/components/fecha";
import { PageHeader } from "@/components/page-header";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaVacia } from "@/components/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { RegistroRapido } from "@/components/registro-rapido";
import { ListaActividad } from "@/components/lista-actividad";
import { AccesoRapido } from "@/components/acceso-rapido";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { leerSesion } from "@/server/auth/session";
import { puedeCrearEditarClientes, puedeGestionarUsuarios, puedeGestionarTransacciones } from "@/lib/permisos";
import { cn } from "@/lib/utils";
import { obtenerDashboard, type ClienteSaldoAlertaDTO } from "@/server/services/dashboard";
import { listarActividadReciente } from "@/server/services/actividad";
import { listarClientesParaSelector } from "@/server/services/clientes";
import type { Rol } from "@/types/dominio";

const ACTIVIDAD_LIMITE = 6;

export default async function DashboardPage() {
  const [usuario, kpis, actividad, clientesSelector] = await Promise.all([
    leerSesion(),
    obtenerDashboard(),
    listarActividadReciente(ACTIVIDAD_LIMITE),
    listarClientesParaSelector(),
  ]);

  const rol = usuario?.rol as Rol | undefined;
  const puedeCrearCliente = rol ? puedeCrearEditarClientes(rol) : false;
  const esAdmin = rol ? puedeGestionarUsuarios(rol) : false;
  const puedeRegistrar = rol ? puedeGestionarTransacciones(rol) : false;
  const clientes = puedeRegistrar ? clientesSelector : [];

  const hayBajoMinimo = kpis.itemsBajoMinimo > 0;

  return (
    <div>
      <PageHeader titulo="Dashboard" volver={false} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          etiqueta="Clientes"
          valor={kpis.totalClientes}
          icono={Users}
          claseIcono="bg-muted text-muted-foreground"
          href="/clientes"
        />
        <Tile
          etiqueta="Ventas del mes"
          valor={<Currency value={kpis.ventasMes} />}
          subtitulo={<Tendencia pct={kpis.ventasMesCambioPct} />}
          icono={ShoppingCart}
          claseIcono="bg-venta/10 text-venta"
        />
        <Tile
          etiqueta="Abonos del mes"
          valor={<Currency value={kpis.abonosMes} tono="abono" />}
          subtitulo={<Tendencia pct={kpis.abonosMesCambioPct} />}
          icono={HandCoins}
          claseIcono="bg-abono/10 text-abono"
        />
        <Tile
          etiqueta="Abonos de la semana"
          valor={<Currency value={kpis.abonosSemana} tono="abono" />}
          subtitulo="últimos 7 días"
          icono={HandCoins}
          claseIcono="bg-abono/10 text-abono"
        />
        <Tile
          etiqueta="Saldo pendiente total"
          valor={<Currency value={kpis.saldoPendienteTotal} tono="saldo" />}
          subtitulo={
            kpis.clientesConSaldo > 0
              ? `de ${kpis.clientesConSaldo} cliente${kpis.clientesConSaldo === 1 ? "" : "s"}`
              : undefined
          }
          icono={Scale}
          claseIcono="bg-saldo/10 text-saldo"
        />
        <Tile
          etiqueta="Artículos bajo mínimo"
          valor={kpis.itemsBajoMinimo}
          subtitulo={hayBajoMinimo ? "revisar inventario" : "todo en orden"}
          icono={Boxes}
          claseIcono={hayBajoMinimo ? "bg-devolucion/10 text-devolucion" : "bg-muted text-muted-foreground"}
          href="/inventario?filtro=bajo-minimo"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {puedeRegistrar ? (
          <>
            <AccesoRapido href="/pagos/lote" etiqueta="Registrar abonos" icono={HandCoins} />
            {/* Solo datos serializables: el ícono lo elige RegistroRapido,
                porque una función de lucide no cruza la frontera RSC. */}
            <RegistroRapido
              clientes={clientes}
              tipoInicial="venta"
              etiqueta="Nueva venta"
              presentacion="acceso-rapido"
            />
            <RegistroRapido
              clientes={clientes}
              tipoInicial="devolucion"
              etiqueta="Registrar devolución"
              presentacion="acceso-rapido"
            />
          </>
        ) : null}
        {puedeCrearCliente ? (
          <AccesoRapido href="/clientes/nuevo" etiqueta="Nuevo cliente" icono={Plus} />
        ) : null}
        <AccesoRapido href="/catalogo" etiqueta="Catálogo" icono={Package} />
        <AccesoRapido href="/inventario?filtro=bajo-minimo" etiqueta="Bajo mínimo" icono={Boxes} />
        {esAdmin ? (
          <AccesoRapido href="/admin/auditoria" etiqueta="Auditoría" icono={ScrollText} />
        ) : null}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ListaClientesSaldo
          titulo="Top clientes por saldo"
          vacio="Nadie tiene saldo pendiente."
          clientes={kpis.topClientesSaldo}
        />
        <ListaClientesSaldo
          titulo="Sin abono reciente"
          descripcion="Saldo pendiente, sin abonos en los últimos 30 días"
          vacio="Todos los clientes con saldo abonaron recientemente."
          clientes={kpis.clientesSinAbonoReciente}
          alerta
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Actividad reciente</h2>
        <div className="flex flex-wrap items-center gap-3">
          {puedeRegistrar ? <RegistroRapido clientes={clientes} /> : null}
          <Link
            href="/actividad"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Ver todo →
          </Link>
        </div>
      </div>

      <div className="mt-3">
        <ListaActividad items={actividad} vacio="Sin actividad todavía" />
      </div>
    </div>
  );
}

// Fase 9 / ADR-17. Antes eran 4 tarjetas planas donde un 0 y un 12 se veían
// idénticos. Ahora: ícono con acento (cromo si es neutral, dato si el
// número significa algo — venta/saldo), jerarquía tipográfica real, y
// sublínea de contexto. Las 2 tiles con `href` son clickables de verdad
// (chevron + hover); las 2 sin `href` no lo son, así que se distingue cuál
// lleva a algún lado.
function Tile({
  etiqueta,
  valor,
  subtitulo,
  icono: Icono,
  claseIcono,
  href,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  subtitulo?: React.ReactNode;
  icono: LucideIcon;
  claseIcono: string;
  href?: string;
}) {
  const contenido = (
    <Card className={cn(href && "transition-colors hover:bg-accent")}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", claseIcono)}
          >
            <Icono className="size-5" />
          </div>
          {href ? <ChevronRight className="size-4 text-muted-foreground" /> : null}
        </div>
        <CardDescription className="mt-2">{etiqueta}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{valor}</CardTitle>
        {subtitulo ? <p className="text-xs text-muted-foreground">{subtitulo}</p> : null}
      </CardHeader>
    </Card>
  );

  return href ? <Link href={href}>{contenido}</Link> : contenido;
}

// `--exito`/`--destructive` a propósito, no los cinco tokens de dato: esto
// es retroalimentación sobre una tendencia ("¿vamos mejor?"), no un dato
// del ledger — la misma distinción que docs/DISENO.md hace entre --exito y
// --abono aunque hoy compartan el mismo verde.
function Tendencia({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-muted-foreground">sin mes anterior para comparar</span>;
  }
  if (pct === 0) {
    return <span className="text-xs text-muted-foreground">sin cambio vs. mes pasado</span>;
  }
  const Icono = pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", pct > 0 ? "text-exito" : "text-destructive")}>
      <Icono className="size-3.5" />
      {pct > 0 ? "+" : ""}
      {pct}% vs. mes pasado
    </span>
  );
}

function ListaClientesSaldo({
  titulo,
  descripcion,
  vacio,
  clientes,
  alerta = false,
}: {
  titulo: string;
  descripcion?: string;
  vacio: string;
  clientes: ClienteSaldoAlertaDTO[];
  alerta?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {alerta ? <AlertTriangle className="size-4 text-destructive" /> : null}
        <h2 className="font-heading text-lg font-semibold tracking-tight">{titulo}</h2>
      </div>
      {descripcion ? <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p> : null}
      <PanelTabla className="mt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Último abono</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.length === 0 ? (
              <FilaVacia colSpan={3}>{vacio}</FilaVacia>
            ) : (
              clientes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/clientes/${c.id}`} className="hover:underline">
                      {c.nombre}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.ultimoAbono ? (
                      <Fecha value={c.ultimoAbono} formato="largo" className="text-muted-foreground" />
                    ) : (
                      <Badge variant="destructive">Nunca ha abonado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Currency value={c.saldo} tono="saldo" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </PanelTabla>
    </div>
  );
}
