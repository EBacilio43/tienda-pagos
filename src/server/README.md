# src/server — código server-only

Todo lo que hay aquí puede leer secretos, hablar con la base de datos, o
correr lógica que no debe llegar al navegador. **Nunca se importa desde un
Client Component** (`"use client"`) — ni siquiera un `import type`. Esa
frontera existe para que un secreto o una conexión a BD no termine en el
bundle del cliente (regla 6 de `AGENTS.md`), y la hace inviolable la regla
`no-restricted-imports` de `eslint.config.mjs`: si el lint falla por esto,
no se silencia, se mueve el código.

## Submódulos

| Carpeta | Qué hace | README |
|---|---|---|
| `services/` | La lógica de negocio real — donde viven las reglas 3, 4 y 5 | [`services/README.md`](services/README.md) |
| `actions/` | Server Actions — la capa delgada que conecta un `<form>` con un servicio | [`actions/README.md`](actions/README.md) |
| `auth/` | Sesiones, permisos de acceso, bloqueo de intentos fallidos | [`auth/README.md`](auth/README.md) |
| `pdf/` | Generación del estado de cuenta en PDF | [`pdf/README.md`](pdf/README.md) |
| `audit/` | `registrarAuditoria` — el INSERT de auditoría que todo servicio mutante comparte | [`audit/README.md`](audit/README.md) |
| `db/` | El cliente único de Prisma | [`db/README.md`](db/README.md) |

Además, dos archivos sueltos en esta carpeta:

- **`log.ts`** — `logError(contexto, error)`. Un JSON por línea a stderr
  para cualquier error inesperado (no un `ErrorDominio`/`ErrorPermiso`,
  esos son el camino esperado). Railway captura stdout/stderr, así que
  esto es suficiente sin agregar una dependencia de logging.
- **`instrumentation.ts`** (en `src/`, no aquí, pero relevante): el hook
  de arranque de Next que rehúsa levantar el servidor si falta
  `SESSION_SECRET` — falla temprano, no en el primer login.

## `services/` vs. `actions/` — por qué están separados

Un Server Action es, literalmente, un endpoint HTTP público — su ID es
descubrible en el bundle de producción, así que **cualquiera puede
invocarlo directo con un POST**, sin pasar por la UI (regla 7). Por eso la
autorización real nunca vive en `actions/` — vive en `services/`, en cada
función mutante, antes de tocar la base. `actions/` solo valida la *forma*
del `FormData` (con Zod) y traduce el resultado a algo que
`useActionState` pueda mostrar; si se borrara todo `actions/` y algo
llamara a `services/` directo, seguiría siendo seguro. Si se borrara
`services/` y solo quedara la validación de `actions/`, no lo sería.
