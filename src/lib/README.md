# src/lib — utilidades isomórficas

Todo lo de acá corre igual en servidor y en cliente — nada aquí importa
`@/server/*` (esa frontera existe para que un secreto no termine en el
bundle del cliente, regla 6 de `AGENTS.md`, forzada por ESLint).

| Archivo | Qué es |
|---|---|
| `money.ts` | `decimalAString`, `formatearMoneda`, `sumarMontos`, `multiplicarMonto`, y los regex `REGEX_MONTO`/`REGEX_MONTO_POSITIVO`. Toda la aritmética pasa por centavos-como-`BigInt` — nunca `Number()`/`parseFloat()` sobre un monto (regla 1) |
| `fecha.ts` | `fechaAString` y compañía — lectura de columnas `DATE` con métodos UTC, nunca `toLocaleDateString` (regla 2). También `fechaHoraAString` para timestamps reales (`auditoria.timestamp`, no una columna `DATE`, ahí sí es correcto usar zona horaria explícita) |
| `permisos.ts` | La matriz de permisos por rol (ADR-09) y `ErrorPermiso`. Isomórfico a propósito: la UI lo usa para esconder botones, los servicios para rechazar — el gate real vive en el servicio (regla 7), esto solo evita el viaje redondo en la UI |
| `errores.ts` | `ErrorDominio` — hermana de `ErrorPermiso`. Un error cuyo `.message` es seguro de mostrarle al usuario tal cual, a diferencia de cualquier otro throw (Prisma, red, un bug), que `server/actions/manejar-error.ts` convierte en mensaje genérico + log |
| `articulos.ts` | `claveArticulo` — la identidad de un artículo de venta/devolución cuando no está vinculado al catálogo (`cat:<id>` con vínculo, `libre:<nombre>::<precio>` sin él). Ver |
| `tema.ts` | Constantes del sistema de 3 temas (`claro`/`oscuro`/`sistema`) y el nombre de la cookie — compartido entre el Server Component que la lee y la Server Action que la escribe |
| `utils.ts` | `cn()` — `clsx` + `tailwind-merge`, el helper estándar de shadcn para componer clases sin colisiones |
| `schemas/` | Un archivo por entidad (`venta.ts`, `cliente.ts`, `pago.ts`, `devolucion.ts`, `usuario.ts`, `articulo.ts`), cada uno exportando el `z.object(...)` que valida esa entidad — ver más abajo |

## `schemas/` — la frontera de validación

Cada schema es **la misma fuente** que usa el formulario del lado del
cliente (para el error inline) y el Server Action del lado del servidor
(`schema.safeParse(datos)` antes de tocar la base) — isomórfico a
propósito, no dos validaciones que puedan divergir. Un campo monetario
siempre se valida como `string` contra `REGEX_MONTO`/`REGEX_MONTO_POSITIVO`
de `money.ts`, nunca `z.number()` — coercionar a número ahí sería
exactamente la violación que la regla 1 prohíbe.

`idCatalogo` en `venta.ts`/`devolucion.ts` usa `.nullish()`, no
`.optional()` — nota real dejada en el propio archivo: el cliente manda
`null` explícito (no omite el campo), y `.optional()` sólo acepta
`undefined`. Es la clase de detalle que si se "corrige" a `.optional()`
porque se ve más simple, rompe en producción sin que `tsc` se dé cuenta.
