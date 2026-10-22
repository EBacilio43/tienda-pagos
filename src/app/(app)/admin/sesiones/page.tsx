import type { ReactNode } from "react";
import { requireRole } from "@/server/auth/guards";
import { listarSesionesActivas } from "@/server/services/sesiones";
import { cerrarSesionAction } from "@/server/actions/sesiones";
import { BotonConfirmarAccion } from "@/components/boton-confirmar-accion";
import { PageHeader } from "@/components/page-header";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaVacia, EstadoVacio } from "@/components/estado-vacio";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

export default async function AdminSesionesPage() {
  await requireRole("admin");

  const sesiones = await listarSesionesActivas();

  return (
    <div>
      <PageHeader
        titulo="Sesiones activas"
        descripcion="Solo las que de verdad pueden autenticar ahora mismo"
        volver={false}
      />

      {/* Siete campos, uno de ellos el user-agent completo (una cadena de
          ~120 caracteres) y tres timestamps que no se parten: la tabla pide
          ~900 px. El intento previo fue esconder columnas y reponerlas
          apiladas dentro de la celda de usuario, pero eso deja la anchura
          dependiendo de un `max-w` a ojo sobre el user-agent — y con el
          botón de cerrar al lado seguía saliéndose de 360 px. La tarjeta no
          necesita esa cuenta: cada dato tiene su renglón. Mismo patrón que
          el resto de las pantallas. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {sesiones.length === 0 ? (
          <EstadoVacio titulo="Sin sesiones activas" />
        ) : (
          sesiones.map((s) => (
            <div key={s.id} className="flex flex-col rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">{s.usuarioNombre}</p>
                  <p className="text-sm text-muted-foreground">@{s.username}</p>
                </div>
                <BotonConfirmarAccion
                  etiqueta="Cerrar"
                  etiquetaPendiente="Cerrando…"
                  variante="outline"
                  titulo="Cerrar esta sesión"
                  descripcion={`Se cerrará la sesión de "${s.usuarioNombre}" de inmediato.`}
                  textoConfirmar="Cerrar sesión"
                  accion={cerrarSesionAction.bind(null, s.id)}
                />
              </div>

              <dl className="mt-3 flex flex-col gap-1 border-t pt-3 text-xs">
                <Renglon etiqueta="IP" valor={s.ipAddress ?? "sin IP"} />
                {/* El user-agent es lo único que se trunca: es la cadena
                    larga que no aporta nada después del navegador y la
                    plataforma. `title` conserva el valor completo. */}
                <Renglon
                  etiqueta="Dispositivo"
                  valor={
                    <span className="block truncate" title={s.userAgent ?? undefined}>
                      {s.userAgent ?? "desconocido"}
                    </span>
                  }
                />
                <Renglon etiqueta="Iniciada" valor={s.creadaEn} />
                <Renglon etiqueta="Última actividad" valor={s.ultimaActividad} />
                <Renglon etiqueta="Expira" valor={s.expiraEn} />
              </dl>
            </div>
          ))
        )}
      </div>

      <PanelTabla className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead>Iniciada</TableHead>
              <TableHead>Última actividad</TableHead>
              <TableHead>Expira</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sesiones.length === 0 ? (
              <FilaVacia colSpan={7}>Sin sesiones activas</FilaVacia>
            ) : (
              sesiones.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.usuarioNombre} <span className="text-muted-foreground">({s.username})</span>
                  </TableCell>
                  <TableCell className="tabular-nums">{s.ipAddress ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate" title={s.userAgent ?? undefined}>
                    {s.userAgent ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{s.creadaEn}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {s.ultimaActividad}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{s.expiraEn}</TableCell>
                  <TableCell className="text-right">
                    <BotonConfirmarAccion
                      etiqueta="Cerrar sesión"
                      etiquetaPendiente="Cerrando…"
                      variante="outline"
                      titulo="Cerrar esta sesión"
                      descripcion={`Se cerrará la sesión de "${s.usuarioNombre}" de inmediato.`}
                      textoConfirmar="Cerrar sesión"
                      accion={cerrarSesionAction.bind(null, s.id)}
                    />
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

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-right tabular-nums">{valor}</dd>
    </div>
  );
}
