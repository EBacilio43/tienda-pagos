import { redirect } from "next/navigation";

// Fase 9 / ADR-17 / P15: Redirección para acceso directo /captura-abonos -> /pagos/lote
export default function CapturaAbonosRedirectPage() {
  redirect("/pagos/lote");
}
