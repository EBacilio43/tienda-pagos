import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RegistroRapido } from "@/components/registro-rapido";
import { ListaActividad } from "@/components/lista-actividad";
import { CalendarioActividad } from "@/components/calendario-actividad";
import { EstadoVacio } from "@/components/estado-vacio";
import {
  listarActividadReciente,
  listarActividadDelDia,
  resumenDeActividadPorDia,
} from "@/server/services/actividad";
import { listarClientesParaSelector } from "@/server/services/clientes";
import { leerSesion } from "@/server/auth/session";
import { puedeGestionarTransacciones } from "@/lib/permisos";
import { hoyEnZonaDelNegocio } from "@/lib/fecha";
import {
  celdasDelMes,
  etiquetaDiaLargo,
  mesDelDia,
  parsearDia,
  parsearMes,
} from "@/lib/calendario";
import { cn } from "@/lib/utils";
import type { Rol } from "@/types/dominio";

const LIMITE = 50;

const VISTAS = [
  { valor: "feed", etiqueta: "Feed" },
  { valor: "calendario", etiqueta: "Calendario" },
] as const;

export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; mes?: string; dia?: string }>;
}) {
  const usuario = await leerSesion();
  const rol = usuario?.rol as Rol | undefined;
  const puedeRegistrar = rol ? puedeGestionarTransacciones(rol) : false;

  const params = await searchParams;
  const esCalendario = params.vista === "calendario";

  const clientes = puedeRegistrar ? await listarClientesParaSelector() : [];

  const acciones = puedeRegistrar ? <RegistroRapido clientes={clientes} /> : null;

  const alternador = (
    <div className="mt-6 flex gap-1 border-b">
      {VISTAS.map((v) => (
        <Link
          key={v.valor}
          href={v.valor === "feed" ? "/actividad" : "/actividad?vista=calendario"}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2 text-sm font-medium sm:px-4",
            (v.valor === "calendario") === esCalendario
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {v.etiqueta}
        </Link>
      ))}
    </div>
  );

  if (!esCalendario) {
    const items = await listarActividadReciente(LIMITE);
    return (
      <div>
        <PageHeader
          titulo="Actividad reciente"
          descripcion="Últimos movimientos en todos los clientes"
          acciones={acciones}
          volver={false}
        />
        {alternador}
        <div className="mt-4">
          <ListaActividad items={items} vacio="Sin actividad todavía" mostrarDetalle />
        </div>
      </div>
    );
  }

  // El día elegido manda sobre el `?mes=`: llegar a "5 de septiembre" y que
  // la cuadrícula enseñara otro mes sería un enlace roto en la práctica.
  // Si no viene ninguno, el mes en curso según el calendario del negocio —
  // `hoyEnZonaDelNegocio` y no `new Date()`, que en el contenedor es UTC y
  // cada primero de mes a partir de las 18:00 abriría el mes siguiente.
  const diaElegido = parsearDia(params.dia);
  const mes =
    (diaElegido ? mesDelDia(diaElegido) : null) ??
    parsearMes(params.mes) ??
    hoyEnZonaDelNegocio().slice(0, 7);

  // El rango es el de la cuadrícula VISIBLE, no el del mes: la primera y la
  // última semana enseñan días del mes vecino, y consultando solo el mes
  // esas celdas dirían "sin actividad" teniéndola.
  const celdas = celdasDelMes(mes);
  const [dias, itemsDelDia] = await Promise.all([
    resumenDeActividadPorDia(celdas[0].fecha, celdas[celdas.length - 1].fecha),
    diaElegido ? listarActividadDelDia(diaElegido) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        titulo="Actividad reciente"
        descripcion="Últimos movimientos en todos los clientes"
        acciones={acciones}
        volver={false}
      />
      {alternador}

      <div className="mt-4">
        <CalendarioActividad mes={mes} dias={dias} diaElegido={diaElegido} />
      </div>

      <div className="mt-6">
        {diaElegido && itemsDelDia ? (
          <>
            <h3 className="mb-2 text-sm font-semibold capitalize">
              {etiquetaDiaLargo(diaElegido)}
            </h3>
            <ListaActividad
              items={itemsDelDia}
              vacio="Sin movimientos ese día"
              mostrarDetalle
            />
          </>
        ) : (
          <EstadoVacio titulo="Elige un día para ver sus movimientos" />
        )}
      </div>
    </div>
  );
}
