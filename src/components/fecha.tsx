import { cn } from "@/lib/utils";

// AGENTS.md regla 2: ventas.fecha/pagos.fecha/devoluciones.fecha son DATE,
// Prisma los mapea a medianoche UTC. Métodos UTC siempre — toLocaleDateString
// directo muestra el día anterior en México (UTC−6). `value` viene como
// string YYYY-MM-DD, nunca un objeto Date cruza la frontera RSC. Para
// "largo" se usa un arreglo literal de meses, no Intl — Intl reintroduciría
// la ambigüedad de zona horaria que esta regla existe para evitar.
const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function Fecha({
  value,
  className,
  formato = "corto",
}: {
  value: string;
  className?: string;
  formato?: "corto" | "largo";
}) {
  const fecha = new Date(`${value}T00:00:00Z`);
  const dia = fecha.getUTCDate();
  const mes = fecha.getUTCMonth();
  const anio = fecha.getUTCFullYear();

  const texto =
    formato === "largo"
      ? `${dia} ${MESES_CORTOS[mes]} ${anio}`
      : `${String(dia).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${anio}`;

  return (
    <time dateTime={value} className={cn("tabular-nums whitespace-nowrap", className)}>
      {texto}
    </time>
  );
}
