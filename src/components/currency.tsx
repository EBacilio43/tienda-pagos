import { formatearMoneda } from "@/lib/money";
import { cn } from "@/lib/utils";

export type TonoMonto = "auto" | "neutro" | "venta" | "enganche" | "abono" | "devolucion" | "saldo";

const CLASE_POR_TONO: Record<Exclude<TonoMonto, "auto" | "neutro">, string> = {
  venta: "text-venta",
  enganche: "text-enganche",
  abono: "text-abono",
  devolucion: "text-devolucion",
  saldo: "text-saldo",
};

// Fase 9 / ADR-17. `tono` es la única puerta legítima a los cinco colores
// de datos del ledger — ninguna pantalla escribe una clase de color a
// mano, que es lo que hace aplicable la regla 10 por ESLint. `tabular-nums`
// va siempre: sin esto las columnas de dinero alineadas a la derecha no
// alinean dígito por dígito.
export function Currency({
  value,
  className,
  tono = "auto",
  signo = "ninguno",
}: {
  value: string; // regla 1: string, nunca number
  className?: string;
  tono?: TonoMonto;
  signo?: "ninguno" | "menos";
}) {
  const negativo = value.trim().startsWith("-");
  const claseColor =
    tono === "auto"
      ? negativo
        ? "text-saldo"
        : undefined
      : tono === "neutro"
        ? undefined
        : CLASE_POR_TONO[tono];

  return (
    <span className={cn("tabular-nums", claseColor, className)}>
      {signo === "menos" ? "− " : ""}
      {formatearMoneda(value)}
    </span>
  );
}
