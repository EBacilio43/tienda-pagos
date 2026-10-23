# src/server/services — lógica de negocio

Donde vive el negocio de verdad. Cada función mutante sigue el mismo
patrón: recibe `actor` como primer parámetro, valida el permiso con
`lib/permisos.ts` (`throw new ErrorPermiso()` si no aplica), hace su
trabajo dentro de `prisma.$transaction(...)`, y escribe su renglón de
auditoría con `server/audit/registrarAuditoria` **dentro de esa misma
transacción**, después de conocer el id del registro afectado (regla 5).
Un error de negocio esperado (stock insuficiente, nombre duplicado) se
lanza como `ErrorDominio` (`lib/errores.ts`), no como `Error` genérico —
es lo que le permite a `server/actions/manejar-error.ts` decidir qué
mostrarle al usuario sin filtrar detalles internos.

## Los tres archivos con una invariante propia

- **`saldo.ts`** — regla 3: `saldo(cliente) = Σ ventas − Σ pagos −
  Σ devoluciones − Σ enganches`. Esta es la **única** fórmula del saldo en
  todo el proyecto — vive en la vista SQL `v_saldos_cliente`
  (`prisma/views/`), y `saldo.ts` es un envoltorio delgado sobre ella
  (`obtenerSaldo`, `obtenerSaldos`, `obtenerTodosLosSaldos`,
  `obtenerResumenSaldo`). Ningún otro archivo resta estos cuatro términos
  a mano. Verificado por `scripts/verificar-saldos.ts`.
- **`stock.ts`** — regla 4: `catalogo.stock == Σ movimientos_stock.delta`
  para cada artículo, siempre. `ajustarStockTx` es el único escritor de
  `catalogo.stock` en todo el proyecto — un `UPDATE` atómico
  (`{ increment: delta }` con la validación de no-negativo en el propio
  `WHERE`, no un leer-calcular-escribir, que perdía escrituras bajo
  concurrencia real — ver a y
  `tests/integration/stock-concurrencia.test.ts`). `ventas.ts` y
  `devoluciones.ts` lo llaman dentro de su propia transacción; nunca
  actualizan `stock` directo. Verificado por `scripts/verificar-stock.ts`.
- **`clientes.ts`** — el único servicio con una restricción de negocio
  fuera de las reglas duras: nombre de cliente único (Fase 4,
  `integridad_dominio`), chequeado a mano antes del `INSERT` porque el
  `UNIQUE INDEX` llegó después que el código que lo necesitaba.

## El resto, por lo que hacen

| Archivo | Qué hace |
|---|---|
| `ventas.ts` | Crear/editar/eliminar ventas. `montoTotal` siempre se deriva de `Σ artículos`, nunca un campo aparte que pueda divergir. Artículos sin `idCatalogo` (pieza libre, ) no tocan `stock.ts` |
| `pagos.ts` | Crear/editar/eliminar abonos — libres, sin relación a una venta específica (es un modelo de cuenta corriente, no de facturas que se saldan una por una) |
| `devoluciones.ts` | Crear/editar/eliminar devoluciones. `montoCredito` siempre se deriva de `Σ artículos devueltos`. `calcularDevolubles` agrupa por `claveArticulo` (catálogo o nombre+precio) para saber qué se puede devolver, incluidas piezas libres |
| `catalogo.ts` | Alta/edición/borrado de artículos del catálogo (el catálogo en sí, no el stock — eso es `stock.ts`) |
| `clientes.ts` | CRUD de clientes + `listarClientesParaSelector` (el picker del registro rápido) |
| `usuarios.ts` | Alta/edición de usuarios, reseteo de contraseña, cambio de contraseña propia — todo exclusivo de `admin` salvo cambiar la propia |
| `sesiones.ts` | Listar/cerrar sesiones activas (`admin/sesiones`) |
| `auditoria.ts` | Lectura paginada del log de auditoría (`admin/auditoria`) — no confundir con `server/audit/registrar.ts`, que es el que **escribe** cada renglón |
| `actividad.ts` | `listarActividadReciente` — cruza ventas/pagos/devoluciones de todos los clientes por `fechaRegistroSistema`, para el feed de `/actividad` y el dashboard |
| `dashboard.ts` | Los KPIs del dashboard (ventas del mes, abonos, top clientes por saldo, clientes sin abono reciente) — todo reusando `obtenerTodosLosSaldos()` de `saldo.ts`, nunca reimplementando la resta |
| `estado-cuenta.ts` | Arma los datos del ledger para el PDF (`server/pdf/`) — una fila de "Venta" por venta, no por artículo, para que nunca pueda desalinearse del saldo de `saldo.ts` |
