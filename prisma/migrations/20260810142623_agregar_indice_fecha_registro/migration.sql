-- Feed de actividad reciente (cross-cliente): sin esto, "ORDER BY
-- fecha_registro_sistema DESC LIMIT N" sobre ventas/pagos/devoluciones
-- hace table scan completo en las tres tablas.
CREATE INDEX "ventas_fecha_registro_sistema_idx" ON "ventas"("fecha_registro_sistema");
CREATE INDEX "pagos_fecha_registro_sistema_idx" ON "pagos"("fecha_registro_sistema");
CREATE INDEX "devoluciones_fecha_registro_sistema_idx" ON "devoluciones"("fecha_registro_sistema");
