-- Cierra el ciclo trivial de longitud 1 en absorción de clientes
-- (un cliente no puede estar absorbido por sí mismo).
--
-- IS DISTINCT FROM es null-safe: si absorbido_por es NULL, evalúa a TRUE.
-- Solo rechaza cuando absorbido_por es igual al id de la misma fila.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_no_auto_absorcion"
  CHECK ("absorbido_por" IS DISTINCT FROM "id");
