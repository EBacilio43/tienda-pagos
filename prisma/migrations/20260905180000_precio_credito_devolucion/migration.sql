-- Una devolución no siempre se acredita al precio al que se vendió la pieza:
-- llega con desgaste de uso y se le reconoce menos. Hasta ahora el crédito
-- era, por construcción, Σ (cantidad × precio_unitario) de los artículos
-- devueltos, así que ese caso no se podía capturar.
--
-- La columna NUEVA es el crédito; `precio_unitario` NO cambia de significado
-- y sigue siendo el precio al que la pieza se vendió. Esa separación es la
-- que importa: `calcularDevolubles` (services/devoluciones.ts) empareja lo
-- devuelto contra lo vendido por nombre + precio cuando el artículo no está
-- ligado al catálogo, así que si el descuento se escribiera encima de
-- `precio_unitario`, la pieza devuelta dejaría de emparejar con su venta y
-- quedaría disponible para devolverse otra vez — en silencio, porque el
-- emparejamiento solo resta cuando encuentra la clave.
--
-- NULL = "se acreditó al precio de venta", que es el estado de las 5 filas
-- que hay hoy en producción y el caso normal de aquí en adelante. Por eso no
-- hay backfill: no es un dato faltante, es la ausencia de excepción.
ALTER TABLE "devolucion_articulos" ADD COLUMN "precio_credito" DECIMAL(12,2);

-- Mismo criterio que los CHECK de 20260811020000 (): la
-- integridad no depende de que toda escritura pase por el servicio.
--
-- El tope es decisión de negocio, tomada el 2026-09-05: acreditar más de lo
-- que la pieza costó regala saldo, y el modo de falla real no es alguien
-- haciéndolo a propósito sino el error de dedo — 25000 donde iba 2500 le
-- baja el saldo al cliente por una cifra que nadie autorizó.
--
-- Los dos IS NULL son necesarios, no defensivos: `precio_credito` es NULL en
-- toda fila que no lleva excepción, y `precio_unitario` es nullable desde el
-- esquema legacy (hoy 0 filas, pero la restricción no puede depender de eso).
ALTER TABLE "devolucion_articulos" ADD CONSTRAINT "devolucion_articulos_precio_credito_valido"
  CHECK (
    "precio_credito" IS NULL
    OR ("precio_credito" >= 0 AND ("precio_unitario" IS NULL OR "precio_credito" <= "precio_unitario"))
  );
