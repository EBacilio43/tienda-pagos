# DOMINIO — reglas de negocio de Tienda Pagos

Este documento es la referencia semántica oficial de las reglas de negocio; el
código en `src/server/services/` es la referencia ejecutable.

## Naturaleza del negocio

Ventas a crédito a clientes, sin intereses, sin tabla de amortización, sin
fechas de vencimiento. Un cliente compra, puede dar un enganche al momento de
la venta, y va abonando con pagos libres hasta saldar. Puede haber
devoluciones que acreditan contra el saldo. No hay concepto de "cuota
vencida" ni mora en el sistema actual — es deuda abierta, sin calendario.

## Fórmula del saldo (única, correcta)

```
saldo(cliente) = Σ ventas.monto_total
               − Σ pagos.monto
               − Σ devoluciones.monto_credito
               − Σ ventas.enganche  (solo donde ventas.tiene_enganche = true)
```

- **Puede ser negativo.** Un saldo negativo significa que el cliente pagó de
  más — está "a favor". La UI lo muestra como tal, no lo trunca en cero.
- Esta es la fórmula de `logic.py:266-280` (`calcular_saldo`), la correcta de
  las tres que coexisten hoy. Las otras dos divergen y **no** se replican:
  - `logic.py:809` (dashboard) hace `max(0.0, …)` — trunca los saldos a
    favor. Se descarta.
  - El ledger del PDF (`logic.py:908-918`) sí acumula con signo, pero cada
    renglón de "Venta" usa `Σ cantidad × precio_unitario` por artículo
    (`logic.py:846`) en vez de `ventas.monto_total`. Si `monto_total` no es
    exactamente esa suma (redondeos, edición manual del total), el ledger y
    el saldo de `calcular_saldo` no coinciden.
- **Fix adoptado:** el ledger nuevo emite **una sola fila de "Venta" por
  venta**, con `cargo = ventas.monto_total` — no una fila por artículo. Así
  el ledger y la fórmula de saldo usan el mismo número por construcción y no
  pueden desalinearse. El detalle de artículos se muestra como sub-texto del
  renglón, no como filas de saldo independientes.

## Semántica de cada movimiento

| Movimiento | Efecto en el saldo | Notas |
|---|---|---|
| **Venta** (`monto_total`) | `+` (cargo) | Total ya facturado. No se recalcula desde los artículos — es un campo propio que puede divergir de `Σ artículos` (ver arriba); el nuevo sistema debe decidir si lo deriva o lo preserva editable (documentar en `DECISIONES.md` si cambia). |
| **Enganche** (`ventas.enganche`, solo si `tiene_enganche`) | `−` (abono) | Es un abono inmediato asociado a la venta, no un movimiento independiente. Se resta aparte de los pagos porque vive en la tabla `ventas`, no en `pagos`. |
| **Pago** (`pagos.monto`) | `−` (abono) | Libre, sin relación con una venta específica — abona al saldo total del cliente, no a una venta en particular. |
| **Devolución** (`devoluciones.monto_credito`) | `−` (abono) | Crédito a favor del cliente por artículos devueltos. `monto_credito` debe ser siempre `Σ cantidad × precio acreditado` de los artículos devueltos — hoy eso solo se garantiza al editar (`logic.py:626`), no al crear (`logic.py:566` guarda el valor recibido de la UI sin recalcular). El nuevo sistema lo deriva siempre, en ambos caminos. |

**Una devolución no siempre se acredita al precio de venta** (2026-09-05).
La pieza vuelve con desgaste de uso y el negocio le reconoce menos. Por eso
`devolucion_articulos` tiene dos precios y no uno:

- `precio_unitario` es el precio al que la pieza se **vendió**. No es
  cosmético ni histórico: es la **identidad** del artículo cuando no está
  ligado al catálogo (`lib/articulos.ts`), y por él se empareja lo devuelto
  contra lo vendido para saber qué queda disponible para devolver.
- `precio_credito` (nullable) es lo que de verdad se le **acredita** por
  pieza. `NULL` significa "sin excepción, se acreditó el precio de venta",
  que es el caso normal.

`monto_credito = Σ cantidad × COALESCE(precio_credito, precio_unitario)`, y
sigue derivándose siempre de los artículos: no se recibe suelto del
formulario. El tope es que `precio_credito ≤ precio_unitario` —acreditar más
de lo que la pieza costó regala saldo—, aplicado en el servicio y por un
CHECK en la base.

No existe concepto de "pago aplicado a una venta específica" — es un modelo
de cuenta corriente (running balance), no de facturas individuales que se
saldan una por una.

## Stock

Cada artículo de catálogo tiene `stock` y `stock_minimo`. Vender descuenta,
devolver repone. El sistema nuevo además:
- Ajusta el stock al **editar** o **borrar** una venta o devolución (hoy no
  lo hace — ver tabla de defectos en el plan).
- Registra cada variación como un `movimiento_stock` (tipo, referencia,
  delta, actor, timestamp). Invariante permanente:
  `catalogo.stock == SUM(movimientos_stock.delta)`.
- Relaciona artículos de venta/devolución con el catálogo por `id_catalogo`
  (FK), no por coincidencia de `nombre`. `nombre` y `precio_unitario` en
  `venta_articulos`/`devolucion_articulos` son **snapshot histórico**: el
  precio de una venta pasada no cambia si el catálogo cambia después.

## Roles y permisos

| | consulta | operador | admin |
|---|:--:|:--:|:--:|
| Leer todo, generar PDF | ✅ | ✅ | ✅ |
| Crear/editar clientes | — | ✅ | ✅ |
| Crear/editar/**eliminar** ventas, pagos, devoluciones | — | ✅ | ✅ |
| Ajustar stock | — | ✅ | ✅ |
| Eliminar clientes | — | — | ✅ |
| Catálogo (alta/baja/edición) | — | — | ✅ |
| Usuarios, auditoría, sesiones | — | — | ✅ |

`consulta` es estrictamente de solo lectura. La matriz completa con su
justificación vive en `lib/permisos.ts` (código) y se aplica en cada
servicio, no solo en la UI.

## Lockout de login

5 intentos fallidos → bloqueo de 15 minutos (`models.py:177-180`,
`service.py`). El contador de intentos **no se resetea** cuando el bloqueo
expira naturalmente — hoy queda un trinquete: después de que pasan los 15
minutos, un solo intento fallido más vuelve a bloquear por otros 15. El
sistema nuevo resetea el contador antes de contar un intento si
`bloqueado_hasta` ya pasó.

## Glosario ES ↔ EN

| Español (BD y UI) | Inglés (código interno donde aplique) |
|---|---|
| cliente | client |
| catálogo / artículo | catalog / item |
| venta | sale |
| pago | payment |
| devolución | return |
| enganche | down payment |
| saldo | balance |
| cargo | charge (debit) |
| abono | credit (payment applied) |
| estado de cuenta | account statement |
| stock / stock mínimo | stock / minimum stock |
| movimiento de stock | stock movement |
| usuario / rol | user / role |
| auditoría | audit log |
| sesión | session |
| bloqueo (login) | lockout |

La base de datos permanece en español (nombres de tabla/columna). El
glosario es para que el código y los mensajes de commit/PR en inglés, si los
hay, no inventen términos distintos para lo mismo.
