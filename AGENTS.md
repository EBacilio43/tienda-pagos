# AGENTS.md — Tienda Pagos (Next.js 15)

Instrucciones y reglas duras para agentes de IA y desarrolladores en este repositorio. No son sugerencias de estilo: son invariantes críticas del dominio y la arquitectura. Si un cambio las viola, el cambio está mal, no la regla.

## Contexto del proyecto

Sistema de punto de venta (POS) y administración de ventas a crédito personal (*running balance*) construido en Next.js 15 y PostgreSQL.
- **Reglas del dominio financiero:** [`docs/DOMINIO.md`](docs/DOMINIO.md).
- **Decisiones arquitectónicas (ADRs):** [`docs/DECISIONES.md`](docs/DECISIONES.md).
- **Sistema de diseño y tokens:** [`docs/DISENO.md`](docs/DISENO.md).

---

## Reglas duras de arquitectura y dominio

1. **Dinero:** `Decimal` en el servidor (`src/lib/money.ts`). En la frontera RSC (Server Component/Action → Client Component) siempre `string`, nunca `number`. Un campo monetario **nunca** pasa por `Number()` ni `parseFloat()`.
2. **Fechas `DATE`:** `ventas.fecha`, `pagos.fecha`, `devoluciones.fecha` son `DATE`, no `DATETIME`. Prisma los mapea a medianoche UTC. `toLocaleDateString()` directo muestra el día anterior en México (UTC−6). Usar siempre el componente `<Fecha/>` con métodos UTC (`getUTCFullYear`, etc.) y DTOs con `fecha: string` en formato `YYYY-MM-DD` — nunca un objeto `Date` cruza la frontera RSC.
3. **El saldo se calcula solo en `src/server/services/saldo.ts`:** Ningún otro archivo reimplementa la fórmula. Si una pantalla necesita el saldo, importa de ahí o consulta la vista `v_saldos_cliente`.
4. **`catalogo.stock` se escribe solo desde `src/server/services/stock.ts`:** Toda variación de stock (venta, devolución, edición, borrado, ajuste manual) pasa por ahí e inserta un `movimiento_stock`. Invariante: `stock == SUM(movimientos_stock.delta)` para cada artículo.
5. **Todo servicio mutante recibe `actor` como primer parámetro obligatorio** y escribe su renglón de auditoría (`registrarAuditoria`) dentro de la misma transacción, después de conocer el id del registro afectado. `registro_id` nunca queda `null` en un INSERT.
6. **`@/server/*` nunca se importa desde un archivo `"use client"`:** Esa frontera existe para que un secreto o una conexión a BD no termine en el bundle del cliente. La regla ESLint `no-restricted-imports` la hace inviolable — si el lint falla por esto, no se silencia, se mueve el código.
7. **El middleware de Next (`src/middleware.ts`) no autoriza, solo redirige por UX:** Autorizan: los layouts (`requireUser()`, `requireRole()`) y, de forma real, cada servicio — porque cada Server Action es un endpoint HTTP público cuyo ID es descubrible en el bundle de producción.
8. **La base de datos está en español y se queda en español:** Nombres de tabla y columna existentes no se traducen; se mapean con `@map`/`@@map` si Prisma necesita un alias en el código TS.
9. **Sin abstracciones especulativas:** No se diseña para fases futuras inciertas. Cada tarea se implementa completa según su alcance, ni más ni menos.
10. **Color y tipografía solo por token:** Ningún archivo de `src/` escribe un color literal (ni clases de paleta de Tailwind tipo `text-red-600`, ni hex, ni `rgb()` inline). Todo color sale de los tokens semánticos de `src/app/globals.css` (cromo o los 5 de movimiento: `venta`, `enganche`, `abono`, `devolucion`, `saldo`). Única excepción: `src/server/pdf/paleta.ts`, verificado por `scripts/verificar-paleta.ts`.

---

## Entorno y comandos del proyecto

Todo se ejecuta dentro de Docker (`docker compose exec app <comando>`):

- `docker compose exec app npm run lint` — ESLint.
- `docker compose exec app npx tsc --noEmit` — Typecheck estricto de TypeScript.
- `docker compose exec app npm test` — Pruebas unitarias (`tests/unit/`, lógica pura sin BD).
- `docker compose exec app npm run test:integration` — Pruebas de integración contra base de datos aislada (`tests/integration/`).
- `npm run test:e2e` — Pruebas E2E de Playwright (se corre desde el host con Docker arriba).
- `docker compose exec app npm run verificar-saldos` / `npm run verificar-stock` — Regresión de reglas 3 y 4.
- `docker compose exec app npm run db:seed` — Siembra de datos iniciales sintéticos.

---

## Flujo de trabajo y ramas

- **`main`:** Código listo para producción o despliegue.
- **`develop`:** Rama de integración principal. Todo trabajo nuevo parte de aquí:
  ```bash
  git checkout develop
  git pull
  git checkout -b <tipo>/<slug> develop
  ```
- Al terminar: verificar lint, tipos y pruebas unitarias dentro de Docker.

---

## Convención de commits y Pull Requests

[Conventional Commits](https://www.conventionalcommits.org/):
```text
<tipo>(<alcance>): <descripción en minúscula, sin punto final>
```

- **Alcances válidos:**
  - Dominio: `clientes`, `ventas`, `pagos`, `devoluciones`, `catalogo`, `stock`, `saldo`, `actividad`, `dashboard`, `usuarios`, `auditoria`, `sesiones`.
  - Transversales: `auth`, `pdf`, `ui`, `db`, `docker`, `deploy`, `tests`, `convenciones`, `ci`.
- **Tipos válidos:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `style`, `perf`, `revert`.
- **Título:** Menos de 100 caracteres.
- **Cuerpo:** Obligatorio cuando haya contexto o motivación técnica que documentar.
