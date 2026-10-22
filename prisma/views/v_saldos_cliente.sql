-- Fuente única de verdad del saldo (AGENTS.md regla 3, docs/DOMINIO.md).
-- saldo = Σ ventas.monto_total − Σ pagos.monto − Σ devoluciones.monto_credito
--         − Σ ventas.enganche (solo donde tiene_enganche = true)
--
-- Puede ser negativo (cliente a favor) — no se trunca en cero, a
-- diferencia de logic.py:809 en el sistema legacy.
CREATE VIEW v_saldos_cliente AS
SELECT
  c.id AS cliente_id,
  (
    COALESCE(v.total_ventas, 0)
      - COALESCE(p.total_pagos, 0)
      - COALESCE(d.total_devoluciones, 0)
      - COALESCE(v.total_enganches, 0)
  )::NUMERIC(12, 2) AS saldo
FROM clientes c
LEFT JOIN (
  SELECT
    id_cliente,
    SUM(monto_total) AS total_ventas,
    SUM(CASE WHEN tiene_enganche IS TRUE THEN COALESCE(enganche, 0) ELSE 0 END) AS total_enganches
  FROM ventas
  GROUP BY id_cliente
) v ON v.id_cliente = c.id
LEFT JOIN (
  SELECT id_cliente, SUM(monto) AS total_pagos
  FROM pagos
  GROUP BY id_cliente
) p ON p.id_cliente = c.id
LEFT JOIN (
  SELECT id_cliente, SUM(monto_credito) AS total_devoluciones
  FROM devoluciones
  GROUP BY id_cliente
) d ON d.id_cliente = c.id;
