// Fase 9+. Pie de "quién y cuándo" en las pantallas de detalle — lee de
// la misma auditoría que ya escribe todo servicio mutante (regla 5), no de
// una fuente nueva. Sin JSX condicional por campo: si no hay auditoría
// (registro migrado, muy anterior a esta fase) el componente entero se
// omite en vez de mostrar guiones.
export function RegistroAuditoria({
  creadoPor,
  creadoEl,
  editadoPor,
  editadoEl,
}: {
  creadoPor: string | null;
  creadoEl: string | null;
  editadoPor: string | null;
  editadoEl: string | null;
}) {
  if (!creadoEl) return null;

  return (
    <p className="mt-4 text-xs text-muted-foreground">
      Registrado por {creadoPor ?? "—"} el {creadoEl}
      {editadoEl ? ` · Última edición por ${editadoPor ?? "—"} el ${editadoEl}` : ""}
    </p>
  );
}
