# prisma — esquema, migraciones, seed

```
schema.prisma     modelos + @@map/@map a los nombres reales en español
migrations/       7 migraciones, aplicadas a mano — ver abajo
views/            SQL de v_saldos_cliente (Prisma no genera DDL de vistas)
seed.ts           datos de prueba, idempotente y aditivo
```

## La base está en español, el código en TypeScript

`AGENTS.md` regla 8: nombres de tabla y columna existentes no se
traducen — `schema.prisma` los mapea con `@map`/`@@map` (`idCliente` ↔
`id_cliente`, `Venta` ↔ `ventas`). Si algo nuevo necesita una columna, el
nombre en la BD sigue en español; el campo del modelo, en camelCase.

## `migrate dev` no funciona en este repo — usar `migrate deploy`

La base de datos local se bootstrapeó importando el esquema legacy real
(incluida `alembic_version`, tabla de Alembic/Python que Prisma no
gestiona), no corriendo `migrate deploy` desde cero. Por eso
`prisma migrate dev` falla contra la shadow database con
`P1014: the underlying table for model alembic_version does not exist`.

**Para cualquier migración nueva:** escribir el SQL a mano en
`migrations/<timestamp>_<nombre>/migration.sql` (mismo formato que las
que ya existen) y aplicar con `prisma migrate deploy` — que no usa shadow
database. Confirmar con `prisma migrate status`.

Ese mismo detalle importa para **cualquier base genuinamente vacía**
(una nueva para pruebas, o CI): la migración `00000000000001_sesiones`
hace `DROP TABLE alembic_version`, que en una base vacía de verdad no
existe. El fix — dejar que el baseline falle ahí a propósito, crear un
stub `CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)`,
marcar esa migración `resolve --rolled-back`, reintentar — está
documentado paso a paso en
[`tests/integration/setup.ts`](../tests/README.md) y ya automatizado en
`.github/workflows/ci.yml`.

## Las 7 migraciones

| # | Qué hace |
|---|---|
| `00000000000000_baseline` | Esquema completo, generado con `migrate diff --from-empty` — el equivalente que Alembic nunca tuvo |
| `00000000000001_sesiones` | Tabla `sesiones` (ADR-15, sesiones opacas propias) |
| `00000000000002_v_saldos_cliente` | La vista de la regla 3 |
| `00000000000003_movimientos_stock` | La tabla de la regla 4 |
| `00000000000004_integridad_dominio` | `id_catalogo` en `venta_articulos`/`devolucion_articulos`, `UNIQUE INDEX` en `clientes.nombre` |
| `20260810142623_agregar_indice_fecha_registro` | Índice en `fecha_registro_sistema` — lo necesita el feed de `/actividad` para no hacer table scan |
| `20260811020000_indices_fk_y_check_constraints` | Índices en FK calientes + `CHECK` de no-negativos |

## `seed.ts`

Idempotente y aditivo — no asume una base vacía. Solo llena lo que falte:
un admin si no existe uno, catálogo si está vacío, y tres clientes marcados
(`@seed.invalid`) que ejercitan los casos borde de la fórmula del saldo —
enganche, sobrepago (saldo negativo), devolución total. `npm run db:seed`.
