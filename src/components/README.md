# src/components — UI

Dos capas, con una regla de ubicación fija (Fase 9 / ADR-17):

- **`ui/`** — primitivas genéricas, sin conocimiento del dominio. Lo que
  `npx shadcn add` generaría o pisaría. Nunca importan de `server/` ni
  saben qué es un "cliente" o una "venta".
- **`components/*.tsx`** (raíz de esta carpeta) — composiciones propias de
  esta app: formularios completos, layout compartido, piezas que sí saben
  de dominio.

Si algo podría vivir en cualquier proyecto Next.js sin cambiar una línea,
va en `ui/`. Si depende de cómo funciona *este* negocio, va en la raíz.

## `ui/` — primitivas

`alert.tsx`, `alert-dialog.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`,
`checkbox.tsx`, `control.ts`, `input.tsx`, `label.tsx`, `select.tsx`,
`skeleton.tsx`, `table.tsx`, `tabs.tsx`.

Dos cosas no obvias:

- **`control.ts`** exporta `claseControl`, la clase base compartida entre
  `input.tsx` y `select.tsx` — antes cada uno tenía su propia cadena de
  clases y podían divergir (la causa raíz de un bug real de Fase 9). Si
  agregas un control nuevo con la misma pinta visual, reusa esto, no
  copies la clase de otro.
- **`badge.tsx`** tiene variantes `venta`/`enganche`/`abono`/`devolucion`
  además de las genéricas (`default`, `outline`, `destructive`...) — son
  los cinco colores de dato de `docs/DISENO.md`, no croma. No agregar una
  variante nueva con un color a mano; ver regla 10 de `AGENTS.md`.

## Raíz — composiciones de esta app

**Layout compartido:** `page-header.tsx` (título + botón de volver,
`components/boton-volver.tsx`), `panel-tabla.tsx`, `paginacion.tsx`,
`estado-vacio.tsx` (`FilaVacia`/`EstadoVacio`), `pantalla-error.tsx`,
`nav-lateral.tsx` / `nav-movil.tsx` (sidebar, requieren `"use client"`
porque necesitan `usePathname()` para la ruta activa — un Server Component
no se vuelve a renderizar solo porque cambió la URL dentro del mismo
layout).

**Formularios de dominio** (uno por entidad, todos con el mismo patrón:
`useActionState` + Server Action real, validación con el mismo schema Zod
que el servidor): `cliente-form.tsx`, `venta-form.tsx`,
`devolucion-form.tsx`, `pago-form.tsx`, `usuario-form.tsx`,
`editar-usuario-form.tsx`, `resetear-password-form.tsx`,
`cambiar-password-form.tsx`, `login-form.tsx`, `crear-articulo-form.tsx`.
`campo.tsx` (`Campo`/`CampoTexto`) es el wrapper de label+error+
aria-describedby que todos ellos comparten — no reimplementar esto por
formulario.

**Piezas de una sola pantalla pero con lógica propia:** `catalogo-grid.tsx`,
`clientes-tarjetas.tsx` (la rejilla de tarjetas de `/clientes`, con la
selección múltiple que arma el PDF de varios estados de cuenta),
`modal-ruta.tsx` (envoltorio de las rutas interceptadas `@modal`),
`registro-rapido.tsx` (el modal que monta
`VentaForm`/`PagoForm`/`DevolucionForm` real desde el feed de actividad —
sin duplicar lógica de negocio),
`selector-tema.tsx` (Server Component puro, cero JS — un `<form>` con tres
botones submit), `boton-confirmar-accion.tsx` (reemplaza los
`window.confirm()` nativos con un `AlertDialog` real).

**Presentación de dato monetario/fecha** (las dos únicas puertas legítimas
a la regla 1 y la regla 2 respectivamente): `currency.tsx`, `fecha.tsx`.
Cualquier lugar que muestre un monto o una fecha usa estos, no formatea a
mano — ver `AGENTS.md` reglas 1 y 2.
