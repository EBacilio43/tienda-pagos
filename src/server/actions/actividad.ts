"use server";

import { requireUser } from "@/server/auth/guards";
import { listarCatalogo } from "@/server/services/catalogo";
import { obtenerArticulosDevolubles } from "@/server/services/devoluciones";
import type { CatalogoItemDTO, ArticuloDevolubleDTO } from "@/types/dominio";

export type DatosParaRegistro =
  | { tipo: "venta"; catalogo: CatalogoItemDTO[] }
  | { tipo: "pago" }
  | { tipo: "devolucion"; devolubles: ArticuloDevolubleDTO[] };

// Registro rápido desde /actividad y el dashboard: una vez elegido
// cliente + tipo, esto trae solo los datos de soporte que el formulario
// real (VentaForm/PagoForm/DevolucionForm, sin duplicar) necesita para
// montarse — el alta en sí sigue pasando por crearVentaAction/
// crearPagoAction/crearDevolucionAction, los mismos de siempre.
export async function obtenerDatosParaRegistroAction(
  tipo: "venta" | "pago" | "devolucion",
  clienteId: number
): Promise<DatosParaRegistro> {
  await requireUser();

  if (tipo === "pago") return { tipo: "pago" };
  if (tipo === "venta") {
    const catalogo = await listarCatalogo();
    return { tipo: "venta", catalogo };
  }
  const devolubles = await obtenerArticulosDevolubles(clienteId);
  return { tipo: "devolucion", devolubles };
}
