-- Indices en las llaves foraneas por donde entran el detalle
-- de cliente, el ledger y v_saldos_cliente para optimizar consultas con volumen.
CREATE INDEX "ix_ventas_id_cliente" ON "ventas" ("id_cliente");
CREATE INDEX "ix_pagos_id_cliente" ON "pagos" ("id_cliente");
CREATE INDEX "ix_devoluciones_id_cliente" ON "devoluciones" ("id_cliente");
CREATE INDEX "ix_venta_articulos_id_venta" ON "venta_articulos" ("id_venta");
CREATE INDEX "ix_devolucion_articulos_id_devolucion" ON "devolucion_articulos" ("id_devolucion");

-- Restricciones CHECK para garantizar integridad a nivel de base de datos:
-- catalogo.stock >= 0, pagos.monto > 0, etc.
-- NULL pasa un CHECK (se evalua a UNKNOWN, no a FALSE) — a proposito: los
-- campos nullable (monto_total, enganche) siguen aceptando NULL,
-- la regla solo prohibe negativos cuando SI hay un valor.
ALTER TABLE "catalogo" ADD CONSTRAINT "catalogo_stock_no_negativo" CHECK ("stock" >= 0);
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_monto_total_no_negativo" CHECK ("monto_total" >= 0);
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_enganche_no_negativo" CHECK ("enganche" >= 0);
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_monto_credito_no_negativo" CHECK ("monto_credito" >= 0);
