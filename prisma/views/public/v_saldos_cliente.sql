SELECT
  c.id AS cliente_id,
  (
    (
      (
        (
          COALESCE(v.total_ventas, (0) :: numeric) - COALESCE(p.total_pagos, (0) :: numeric)
        ) - COALESCE(d.total_devoluciones, (0) :: numeric)
      ) - COALESCE(v.total_enganches, (0) :: numeric)
    )
  ) :: numeric(12, 2) AS saldo
FROM
  (
    (
      (
        clientes c
        LEFT JOIN (
          SELECT
            ventas.id_cliente,
            sum(ventas.monto_total) AS total_ventas,
            sum(
              CASE
                WHEN (ventas.tiene_enganche IS TRUE) THEN COALESCE(ventas.enganche, (0) :: numeric)
                ELSE (0) :: numeric
              END
            ) AS total_enganches
          FROM
            ventas
          GROUP BY
            ventas.id_cliente
        ) v ON ((v.id_cliente = c.id))
      )
      LEFT JOIN (
        SELECT
          pagos.id_cliente,
          sum(pagos.monto) AS total_pagos
        FROM
          pagos
        GROUP BY
          pagos.id_cliente
      ) p ON ((p.id_cliente = c.id))
    )
    LEFT JOIN (
      SELECT
        devoluciones.id_cliente,
        sum(devoluciones.monto_credito) AS total_devoluciones
      FROM
        devoluciones
      GROUP BY
        devoluciones.id_cliente
    ) d ON ((d.id_cliente = c.id))
  );