const RUTA_POR_TIPO: Record<string, string> = {
  venta: "ventas",
  enganche: "ventas",
  pago: "pagos",
  devolucion: "devoluciones",
};

// server/services/actividad.ts y estado-cuenta.ts componen sus ids como
// "<tipo>-<id numérico>" de forma independiente (mismo convenio, dos
// lugares) — este es el único punto que lo interpreta de vuelta para armar
// el link de detalle. Un enganche no tiene registro propio en BD: es parte
// de su venta, así que su detalle es el de esa venta.
export function hrefDetalleMovimiento(idCompuesto: string, tipo: string): string {
  const idNumerico = idCompuesto.split("-")[1];
  const ruta = RUTA_POR_TIPO[tipo] ?? "clientes";
  return `/${ruta}/${idNumerico}`;
}
