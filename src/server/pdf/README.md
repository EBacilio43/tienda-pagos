# src/server/pdf — estado de cuenta en PDF

Dos archivos: `estado-cuenta.tsx` (el documento, con `@react-pdf/renderer`
— componentes tipo React pero que renderizan a PDF, no a HTML) y
`paleta.ts` (los colores que usa).

Servido por
[`src/app/api/reportes/estado-cuenta/route.tsx`](../../app/README.md)
como binario — un PDF no es algo que una Server Action deba devolver.

## `paleta.ts` — la única excepción a la regla 10

`AGENTS.md` regla 10 prohíbe un color literal en cualquier archivo de
`src/` — todo color sale de los tokens OKLCH de `src/app/globals.css`.
`@react-pdf/renderer` no puede leer variables CSS, así que esta carpeta es
la **única** excepción explícita: los hexes viven acá, en un objeto
`COLOR` con cada valor anotado con el token OKLCH del que es conversión.

Eso crea una invariante que nada obliga automáticamente por sí sola — "el
PDF se ve igual que la app" solo se sostiene si alguien recuerda
actualizar `paleta.ts` cuando cambia un token en `globals.css`. Por eso
existe `scripts/verificar-paleta.ts`: parsea los `oklch(...)` de
`:root` en `globals.css`, los convierte a sRGB, y compara contra
`paleta.ts` — si alguien cambia un token y se olvida de este archivo, el
script falla con un diff legible en vez de que la divergencia quede como
un PDF que se ve distinto a la app y nadie nota hasta que alguien lo mira.
Corre en cada push (`.github/workflows/ci.yml`).

## Por qué el ledger es una fila por venta, no por artículo

`estado-cuenta.tsx` recibe los datos ya armados por
`server/services/estado-cuenta.ts`, que emite **una sola fila de "Venta"
por venta**, con `cargo = ventas.monto_total` — nunca una fila por
artículo con `Σ cantidad × precio_unitario`. El legacy sí desglosaba por
artículo, y esa suma podía no coincidir con `monto_total` (redondeos,
edición manual del total) — el ledger y la fórmula del saldo
(`server/services/saldo.ts`) podían mostrar números distintos para el
mismo cliente. Con una fila por venta, ambos usan el mismo número por
construcción; el detalle de artículos se muestra como sub-texto de la
fila, no como filas de saldo independientes.
