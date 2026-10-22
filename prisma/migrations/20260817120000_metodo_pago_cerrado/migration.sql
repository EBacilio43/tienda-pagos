-- Cierra `pagos.metodo_pago` al conjunto canónico de métodos permitidos
-- para evitar inconsistencias de escritura por texto libre.

-- 1. Normalización por mayúsculas/minúsculas al valor canónico. Se hace
--    caso por caso y no con un mapeo genérico a 'Otro': reescribir un
--    valor desconocido a 'Otro' perdería el dato original en silencio. Si
--    después del UPDATE queda algo fuera del conjunto, el CHECK de abajo
--    hace fallar la migración a propósito — es preferible mirar qué era.
UPDATE "pagos" SET "metodo_pago" = 'Efectivo'     WHERE lower("metodo_pago") = 'efectivo';
UPDATE "pagos" SET "metodo_pago" = 'Transferencia' WHERE lower("metodo_pago") = 'transferencia';
UPDATE "pagos" SET "metodo_pago" = 'Tarjeta'      WHERE lower("metodo_pago") = 'tarjeta';
UPDATE "pagos" SET "metodo_pago" = 'Depósito'     WHERE lower("metodo_pago") IN ('depósito', 'deposito');
UPDATE "pagos" SET "metodo_pago" = 'Otro'         WHERE lower("metodo_pago") = 'otro';

-- 2. Restricción CHECK en la base de datos para garantizar integridad estructural.
--    NULL pasa un CHECK (se evalúa a UNKNOWN, no a FALSE): la columna es opcional.
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_metodo_pago_valido"
  CHECK ("metodo_pago" IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Depósito', 'Otro'));
