# src/app — rutas

App Router de Next.js 15. Tres route groups, cada uno con su propio
layout y su propia forma de autorizar:

```
app/
├── layout.tsx        raíz — cookie de tema, fuentes, <html>
├── (app)/             autenticado — sidebar, header, requireUser()
│   ├── layout.tsx
│   ├── actividad/      feed cruzado de ventas/pagos/devoluciones
│   ├── admin/           auditoria, sesiones, usuarios — requireRole("admin")
│   ├── catalogo/
│   ├── clientes/
│   ├── devoluciones/
│   ├── inventario/
│   ├── mi-cuenta/
│   ├── pagos/
│   └── ventas/
├── (auth)/             público — login
│   ├── layout.tsx
│   └── login/
└── api/                Route Handlers — JSON/binarios, no HTML
    ├── auth/logout/
    ├── health/
    └── reportes/estado-cuenta/   PDF del estado de cuenta
```

## Quién autoriza qué (regla 7 de `AGENTS.md`)

`src/middleware.ts` **no autoriza** — solo redirige a `/login` si falta la
cookie de sesión, por UX. Eso se puede saltar con un header
(CVE-2025-29927), así que quien autoriza de verdad son los layouts:

- `(app)/layout.tsx` llama `requireUser()` — sin sesión válida, redirige.
  Cada página bajo `(app)/admin/*` además llama `requireRole("admin")` en
  la propia página, no en un layout intermedio (no hay uno).
- `(auth)/login/page.tsx` hace lo inverso: si ya hay sesión, redirige a `/`.

Ninguna de las dos cosas es la autorización real, sin embargo — cada
Server Action es un endpoint HTTP público cuyo ID es descubierto en el
bundle de producción, así que el gate que de verdad importa está en
`src/server/services/*.ts` (ver
[`src/server/README.md`](../server/README.md)). Los guards de acá son UX:
evitan que alguien con sesión válida pero sin permiso vea un botón que de
todos modos el servicio le va a rechazar.

## Patrón de página

Casi toda página es un Server Component `async` que: llama al guard
correspondiente, hace `Promise.all` de lo que necesita leer (vía
`server/services/*`), y renderiza con los componentes compartidos de
[`src/components/`](../components/README.md) (`PageHeader`, `PanelTabla`,
`Paginacion`, etc.). Las mutaciones no son fetch — son
`<form action={accionDeServerAction}>` con `useActionState` del lado del
Client Component correspondiente en `components/`.

## Por qué `api/` casi no tiene nada

Casi todo en esta app es Server Component + Server Action, no JSON. Las
tres excepciones bajo `api/` existen porque no encajan en ese molde:
`logout` necesita ser un POST plano invocable desde un `<form action="...">`
sin JS, `health` es un checkeo de liveness sin sesión, y
`reportes/estado-cuenta` devuelve un binario (PDF), no HTML — un Route
Handler es la forma correcta de responder cualquiera de los tres, una
Server Action no.
