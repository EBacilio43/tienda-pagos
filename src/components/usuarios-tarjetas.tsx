import Link from "next/link";
import { Mail, KeyRound, Pencil, Clock, LogIn, CalendarPlus, ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/estado-vacio";
import { cn } from "@/lib/utils";
import type { EstadoUsuario, UsuarioListaDTO } from "@/types/dominio";

// Server Component a propósito, a diferencia de <ClientesTarjetas>: aquí no
// hay selección ni ninguna otra interacción — la tarjeta muestra datos y sus
// dos acciones son enlaces.

// Iniciales para el avatar, mismo criterio que ClientesTarjetas: ancla para
// escanear la lista, en tokens neutros de cromo (docs/DISENO.md — el color
// es dato, no decoración; aquí el único color con significado es el del
// estado de la cuenta).
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  return palabras
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// El color no es la única señal: cada estado lleva además su propia
// etiqueta escrita. Un punto verde y uno gris son el mismo punto en escala
// de grises, y "En línea" / "Sin sesión" no.
const ESTADO: Record<EstadoUsuario, { etiqueta: string; clasePunto: string; claseTexto: string }> = {
  en_linea: {
    etiqueta: "En línea",
    clasePunto: "bg-exito",
    claseTexto: "text-exito",
  },
  activo: {
    etiqueta: "Sin sesión",
    clasePunto: "bg-muted-foreground/60",
    claseTexto: "text-muted-foreground",
  },
  // `--devolucion` como color de advertencia sigue el precedente ya
  // establecido por <Alert variant="aviso">, no inventa un token nuevo.
  bloqueado: {
    etiqueta: "Bloqueado",
    clasePunto: "bg-devolucion",
    claseTexto: "text-devolucion",
  },
  desactivado: {
    etiqueta: "Desactivado",
    clasePunto: "bg-destructive",
    claseTexto: "text-destructive",
  },
};

export function UsuariosTarjetas({
  usuarios,
  usuarioActualId,
}: {
  usuarios: UsuarioListaDTO[];
  usuarioActualId: number;
}) {
  if (usuarios.length === 0) {
    return <EstadoVacio titulo="Sin usuarios" descripcion="Todavía no hay ninguna cuenta dada de alta." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {usuarios.map((u) => {
        const estado = ESTADO[u.estado];
        const esYo = u.id === usuarioActualId;

        return (
          <div
            key={u.id}
            className={cn(
              "flex flex-col rounded-xl border bg-card p-4",
              // Una cuenta desactivada se lee distinto sin depender solo del
              // color: el borde de la tarjeta entera lo dice también.
              u.estado === "desactivado" && "border-destructive/40",
              u.estado === "bloqueado" && "border-devolucion/40"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="relative shrink-0">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted font-heading text-sm font-semibold text-muted-foreground">
                  {iniciales(u.nombreCompleto)}
                </div>
                <span
                  className={cn(
                    "absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card",
                    estado.clasePunto
                  )}
                  aria-hidden
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-heading font-medium">
                  <span className="truncate">{u.nombreCompleto}</span>
                  {esYo ? (
                    <Badge variant="outline" className="shrink-0">
                      Tú
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">@{u.username}</p>
              </div>

              <Badge variant="outline" className="shrink-0 capitalize">
                {u.rol}
              </Badge>
            </div>

            <p className={cn("mt-3 text-xs font-medium tracking-wide uppercase", estado.claseTexto)}>
              {estado.etiqueta}
              {u.sesionesActivas > 1 ? ` · ${u.sesionesActivas} sesiones` : null}
            </p>

            {u.bloqueadoHasta ? (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-devolucion/25 bg-devolucion/10 p-2 text-xs text-devolucion">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Bloqueado hasta {u.bloqueadoHasta} tras {u.intentosFallidos} intento
                  {u.intentosFallidos === 1 ? "" : "s"} fallido{u.intentosFallidos === 1 ? "" : "s"}.
                </span>
              </p>
            ) : null}

            <dl className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-sm text-muted-foreground">
              <Renglon
                icono={LogIn}
                etiqueta="Último acceso"
                valor={u.ultimoLogin}
                relativo={u.ultimoLoginRelativo}
                vacio="Nunca ha entrado"
              />
              <Renglon
                icono={Clock}
                etiqueta="Última actividad"
                valor={u.ultimaActividad}
                relativo={u.ultimaActividadRelativa}
                vacio="Sin actividad registrada"
              />
              <Renglon icono={Mail} etiqueta="Email" valor={u.email} vacio="Sin email" />
              <Renglon icono={CalendarPlus} etiqueta="Alta" valor={u.creadoEn} vacio="Sin fecha de alta" />
            </dl>

            {/* mt-auto: con tarjetas de alto distinto en la misma fila del
                grid (una con el aviso de bloqueo, otra sin él), esto deja
                los botones alineados abajo en vez de flotando a media
                tarjeta. */}
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              {esYo ? (
                // Editarse a uno mismo por esta vía está bloqueado en el
                // servicio a propósito (usuarios.ts) — ofrecer el botón
                // sería llevar al usuario a un error garantizado.
                <Link
                  href="/mi-cuenta"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Pencil className="size-4" />
                  Mi cuenta
                </Link>
              ) : (
                <>
                  <Link
                    href={`/admin/usuarios/${u.id}/editar`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                  <Link
                    href={`/admin/usuarios/${u.id}/resetear-password`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <KeyRound className="size-4" />
                    Resetear contraseña
                  </Link>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Renglon({
  icono: Icono,
  etiqueta,
  valor,
  relativo,
  vacio,
}: {
  icono: typeof Mail;
  etiqueta: string;
  valor: string | null;
  relativo?: string | null;
  vacio: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icono className="size-3.5 shrink-0" />
      <dt className="sr-only">{etiqueta}</dt>
      {valor ? (
        <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="truncate tabular-nums">{valor}</span>
          {relativo ? <span className="text-xs">({relativo})</span> : null}
        </dd>
      ) : (
        <dd className="truncate">{vacio}</dd>
      )}
    </div>
  );
}
