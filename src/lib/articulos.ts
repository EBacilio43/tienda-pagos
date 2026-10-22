// Los artículos de venta/devolución NO requieren estar obligatoriamente
// vinculados al catálogo (soporta artículos libres con nombre y precio).
// Cuando SÍ hay `idCatalogo`, es la identidad real (mismo artículo del catálogo).
// Cuando no, nombre + precio unitario es la identidad disponible — dos líneas
// con el mismo nombre pero distinto precio son artículos distintos; el mismo nombre
// y precio se tratan como el mismo artículo "libre" (fungible para efectos de devolución).
//
// Compartido servidor/cliente (no importa `@/server/*`, regla 6) — el
// mismo criterio de "qué es el mismo artículo" se usa al calcular
// disponibilidad para devolver (services/devoluciones.ts) y al armar la
// lista en el formulario (devolucion-form.tsx).
export function claveArticulo(a: {
  idCatalogo?: number | null;
  nombre: string;
  precioUnitario: string;
}): string {
  return a.idCatalogo != null
    ? `cat:${a.idCatalogo}`
    : `libre:${a.nombre.trim().toLowerCase()}::${a.precioUnitario.trim()}`;
}
