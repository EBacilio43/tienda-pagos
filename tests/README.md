# tests — unitarias e integración

```
tests/
├── unit/          lógica pura, sin BD — npm test
└── integration/   contra Postgres real (tienda_test) — npm run test:integration
```

## `unit/` — sin BD, sin red

`money.ts`, `fecha.ts`, `permisos.ts`, `errores.ts`/`manejar-error.ts`,
`articulos.ts` (`claveArticulo`), y los esquemas Zod de venta/devolución.
Rápidas (todo el archivo corre en menos de un segundo) porque no tocan
nada externo — `npm test`.

## `integration/` — contra una base de prueba aislada

`saldo.test.ts` (la fórmula de la regla 3 — vive en una vista SQL, no se
puede probar sin Postgres), `ventas.test.ts`, `devoluciones.test.ts`
(stock + auditoría en transacción, `ErrorPermiso` por rol, reversión al
editar/eliminar), `stock-concurrencia.test.ts` (concurrencia **real** — `Promise.all`
disparando `ajustarStock` en paralelo de verdad, no simulado, sobre el
mismo artículo, para que un lost update tenga oportunidad real de
manifestarse si el fix dejara de ser atómico).

`npm run test:integration` corre contra `tienda_test` — una base
**separada** de la base principal. `setup.ts` exporta
`limpiarBaseDePrueba()`, que cada suite llama en `beforeEach` (estado
limpio antes de cada prueba) **y en un `afterAll` al final del archivo**
(estado limpio también al terminar).

### El guardia de seguridad — por qué existe y qué pasa si falla

`limpiarBaseDePrueba()` revienta si `DATABASE_URL` no apunta a una base
que termine en `_test`. No es defensivo por estilo: esta misma
carpeta de pruebas hace `TRUNCATE` sobre las tablas que maneja Prisma.
Un typo en `DATABASE_URL` sin este guardia truncaría datos de desarrollo.
**Se verificó que el guardia funciona** corriendo las pruebas sin el override
correcto y confirmando que revienta antes de tocar una sola fila.

### Primera vez en una base nueva

Una base Postgres genuinamente vacía necesita el mismo stub de
`alembic_version` que documenta [`prisma/README.md`](../prisma/README.md)
antes de poder aplicar migraciones — comentado paso a paso dentro de
`setup.ts`, y ya automatizado en `.github/workflows/ci.yml` si se
necesita replicar en otro lado.
