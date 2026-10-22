# src/types — DTOs de la frontera Server → Client

Un solo archivo hoy, `dominio.ts`: `Rol`, y los DTOs que un **Client
Component** necesita tipar directamente (props de un formulario, una
grid editable) — `CatalogoItemDTO`, `ArticuloDevolubleDTO`,
`ClienteListaDTO`.

## Por qué no viven junto a los servicios que los devuelven

La mayoría de los DTOs de este proyecto se definen y exportan directo
desde `server/services/*.ts`, junto a la función que los produce — eso es
lo normal y **no** hace falta moverlos aquí. Este archivo existe
específicamente para los pocos que un **Client Component** necesita
importar por su tipo — y `server/**` está bloqueado para imports desde
`"use client"` por ESLint (regla 6), **incluso imports de solo tipo**
(`import type { ... }`). Sin este archivo aparte, esos formularios no
tendrían de dónde tipar sus props sin violar la regla.

Si un DTO nuevo solo lo consume otro Server Component o un Server Action,
no necesita venir aquí — solo los que cruzan hacia `"use client"`.
