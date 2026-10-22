# DISEÑO — sistema de tokens de Tienda Pagos

Fuente única: `src/app/globals.css` (`:root` y `.dark`). Este documento es la
referencia semántica de por qué esos valores son los que son; el CSS es la
referencia sintáctica. Regla dura relacionada: `AGENTS.md` regla 10.

## 1. Principio: el color de marca es cromo, los cinco colores de movimiento
   son datos

El azul grisáceo (hue 258 en OKLCH) aparece solo como **superficie**:
sidebar, botón primario, anillo de foco, ruta activa, barras del PDF. Los
cinco colores de `docs/DOMINIO.md` (venta, enganche, abono, devolución,
saldo) aparecen solo como **tinta**: texto de un monto, pastilla de tipo,
borde de 3px en una tarjeta de resumen.

Un botón nunca se pinta de `--venta`. Un monto nunca se pinta de
`--primary`. La separación es mecánica, no solo de gusto: el cromo vive en
croma ≤ 0.085; los datos viven en croma ≥ 0.128 — una diferencia de 2–3× a
simple vista, y es la misma relación que ya usaba el PDF del estado de
cuenta desde Fase 5 (`navy` de la marca vs. las pastillas de movimiento).

El azul grisáceo **no se inventó para esta fase**: es el mismo cromo que el
PDF ya usaba (`navy900`/`navy700`/`line`/`paperMuted`), aprobado por el
usuario en Fase 5. La app adoptó la paleta del PDF, no al revés — por eso
`src/server/pdf/paleta.ts` y `src/app/globals.css` son la conversión exacta
uno del otro (`scripts/verificar-paleta.ts` lo prueba).

## 2. Tokens

Todos los pares texto/fondo de la tabla están verificados con la fórmula de
contraste de WCAG 2.1 (`(L1 + 0.05) / (L2 + 0.05)`); el mínimo AA para texto
normal es 4.5:1. **Ningún par de esta tabla baja de 5.6:1.**

| Token | Rol | Claro | Oscuro | Contraste (claro / oscuro) |
|---|---|---|---|---|
| `--background` / `--foreground` | fondo de página / texto | `oklch(0.992 0.003 258)` / `oklch(0.232 0.014 258)` | `oklch(0.205 0.018 258)` / `oklch(0.945 0.006 258)` | 16.4:1 / 15.3:1 |
| `--muted` / `--muted-foreground` | superficie discreta / texto secundario | `oklch(0.972 0.005 258)` / `oklch(0.495 0.024 258)` | `oklch(0.278 0.02 258)` / `oklch(0.718 0.024 258)` | 5.65:1 / 5.88:1 |
| `--primary` / `--primary-foreground` | marca (botón, foco) | `oklch(0.347 0.073 258)` / `oklch(0.985 0.004 258)` | `oklch(0.7 0.085 258)` / `oklch(0.2 0.02 258)` | 11.0:1 / 6.77:1 |
| `--destructive` | acciones destructivas | `oklch(0.505 0.192 27)` | `oklch(0.7 0.16 27)` | 6.34:1 / 6.25:1 sobre `background` |
| `--sidebar` / `--sidebar-foreground` | navy sólido del sidebar (= `navy900` del PDF) | `oklch(0.259 0.052 258)` / `oklch(0.865 0.014 258)` | `oklch(0.232 0.022 258)` / `oklch(0.88 0.012 258)` | 10.4:1 (ambos modos, mismo diseño) |

Los cinco de datos, contraste medido contra `--background` (peor caso real:
texto de `<Currency>` directamente sobre la página):

| Token | Rol | Claro | Oscuro | Contraste vs. `background` (claro / oscuro) |
|---|---|---|---|---|
| `--venta` | venta | `oklch(0.48 0.19 262)` | `oklch(0.72 0.135 262)` | 6.66:1 / 7.15:1 |
| `--enganche` | enganche | `oklch(0.48 0.205 303)` | `oklch(0.725 0.16 303)` | 7.13:1 / 6.93:1 |
| `--abono` | abono / pago | `oklch(0.48 0.128 150)` | `oklch(0.725 0.16 150)` | 6.02:1 / 7.84:1 |
| `--devolucion` | devolución | `oklch(0.5 0.135 45)` | `oklch(0.75 0.145 45)` | 6.21:1 / 7.67:1 |
| `--saldo` | saldo / cargo | `oklch(0.505 0.192 27)` | `oklch(0.715 0.15 27)` | 6.34:1 / 6.65:1 |

Para contexto: `text-red-600`/`text-green-600` (los literales que existían
antes de Fase 9) dan **~2.3:1 sobre el fondo oscuro** — muy por debajo del
mínimo AA. Ese era el bug real que motivó tokenizar los cinco colores en vez
de solo migrar las clases 1:1.

**Regla al agregar un token nuevo:** se define en los dos modos, con su
contraste medido antes de usarse en una pantalla. No se aprueba un color que
solo se vio en un modo.

## 3. Los cinco colores de movimiento

`venta`, `enganche`, `abono`, `devolucion`, `saldo` — los mismos cinco tipos
de `docs/DOMINIO.md`. Viven en tres superficies, todas derivadas del mismo
origen:

- La pastilla de tipo en el ledger (`Badge` con `variant="venta"` etc.,
  `bg-{token}/10 text-{token} border-{token}/25`).
- La tira de resumen de `/clientes/[id]` (ícono + borde izquierdo de 3px +
  signo aritmético — nunca solo el hue, ver §7 "deuda conocida" no, ver
  el comentario en `clientes/[id]/page.tsx`).
- El PDF (`src/server/pdf/paleta.ts`).

Están **prohibidos como cromo**: no se usan para un botón, un link, un
estado de foco, ni una superficie de navegación.

## 4. `--exito` vs. `--abono`

Mismo verde hoy, tokens distintos a propósito. `--exito` es feedback de que
una operación de UI salió bien (`<Alert variant="exito">`, ej. "Contraseña
cambiada"). `--abono` es un dato del ledger (dinero que un cliente pagó). Si
el verde de éxito cambia de tono en el futuro, el de abono no debe seguirlo
— son conceptualmente independientes aunque hoy compartan valor.

## 4b. El semáforo de estado: `exito` / `devolucion` / `destructive`

Tres pantallas necesitan decir "esto está bien / ojo con esto / esto está
mal" sobre algo que **no es dinero**: el estado de una cuenta de usuario
(`/admin/usuarios`), las métricas de `/admin/sistema`, y los cuatro
`<Alert>` de siempre. Las tres usan los mismos tres tokens:

| Estado | Token | Dónde |
|---|---|---|
| bien / en línea / normal | `--exito` | punto verde de la tarjeta de usuario, tile en rango |
| advertencia / bloqueado / alto | `--devolucion` | `<Alert variant="aviso">`, cuenta bloqueada, tile sobre umbral |
| mal / desactivado / crítico | `--destructive` | `<Alert variant="error">`, cuenta desactivada, tile crítico |

Dos cosas que conviene tener escritas, porque estiran lo que dicen §3 y §4:

1. **`--exito` se usa como estado, no solo como resultado de una
   operación.** §4 lo definió como "una operación de UI salió bien"; "esta
   cuenta tiene sesión abierta" y "esta métrica está en rango" son estado,
   no resultado. Se reusa igual porque es la misma familia semántica
   (verde = sano) y porque un token nuevo con el mismo valor solo se
   justifica cuando los dos conceptos pueden divergir de color, y estos no.

2. **`--devolucion` aparece como cromo de advertencia**, lo que la letra de
   §3 prohíbe ("prohibidos como cromo"). No es nuevo: `<Alert
   variant="aviso">` lo hace desde Fase 9. Se mantiene el precedente en vez
   de abrir un `--aviso` paralelo con el mismo naranja, pero queda
   registrado como la excepción conocida a §3 — si algún día el naranja de
   devolución cambia de tono, los avisos lo seguirán, y ese es el momento
   de separarlos.

**El color nunca es la única señal.** Cada estado lleva su propia palabra
escrita al lado ("En línea", "Bloqueado", "normal", "crítico"), por el mismo
motivo que la tira de resumen de `/clientes/[id]` lleva ícono y signo además
del hue.

## 5. Modo oscuro

Tres estados — claro / oscuro / sistema — resueltos sin `next-themes` y sin
script inline (ver ADR-17 en `docs/DECISIONES.md` para el porqué). Mecanismo
en `src/app/globals.css`:

- `.dark` — elección explícita del usuario ("oscuro"), vía cookie leída por
  `src/app/layout.tsx`.
- `@media (prefers-color-scheme: dark)` sobre `:root:not(.light):not(.dark)`
  — tema "sistema": el `<html>` no lleva clase de tema, y el navegador
  decide en el primer paint. El servidor no puede resolver esto desde una
  cookie (no conoce `prefers-color-scheme`), así que es la única forma sin
  parpadeo y sin JavaScript.

El bloque de tokens oscuros está **duplicado a propósito** entre `.dark` y
la rama `@media` — es la única duplicación del sistema. Se descartó
`light-dark()` (que la evitaría) porque el código base usa modificadores de
opacidad por todos lados (`bg-primary/80`, `ring-ring/50`, `bg-muted/50`),
que Tailwind compila a `color-mix()`; anidar `light-dark()` dentro de
`color-mix()` tiene soporte de navegador irregular y falla en silencio.
`scripts/verificar-tokens.ts` compensa la duplicación: compara ambos
bloques token por token y falla si divergen.

## 6. Dónde vive cada componente

- `src/components/ui/*` — primitivas que el generador (`npx shadcn add`)
  puede regenerar o pisar. Vienen de `@base-ui/react` + `class-variance-authority`.
- `src/components/*` (raíz) — composiciones propias de esta app. El
  generador nunca las toca.

Excepción documentada: `src/components/ui/input.tsx` y
`src/components/ui/select.tsx` comparten la clase base de un control vía
`src/components/ui/control.ts` (`claseControl`) — así un input y un select
no pueden divergir visualmente por construcción.

## 7. Tipografía

Una sola cara: Geist Sans (`next/font/google`, variable `--font-geist-sans`
puesta por `src/app/layout.tsx`). `--font-heading` la reutiliza con
`font-semibold tracking-tight` en vez de traer una segunda cara — evita una
dependencia de red más en el build de producción de Docker.

`tabular-nums` es **obligatorio** en toda celda de dinero o fecha
(`<Currency>` y `<Fecha>` ya lo aplican siempre) — sin esto, las columnas
alineadas a la derecha no alinean dígito por dígito.

## 8. Deuda conocida

- **Fechas pre-formateadas.** `server/services/{auditoria,sesiones,usuarios}.ts`
  devuelven strings ya formateados (`fechaHoraAString`) en vez de ISO crudo,
  así que no hay un punto único donde re-estilar esas fechas — solo reciben
  `className="tabular-nums whitespace-nowrap"` a mano en cada página. El
  arreglo de fondo (que los DTOs devuelvan ISO y un `<FechaHora>` propio
  formatee) toca 3 servicios y sus DTOs; queda fuera de alcance de Fase 9
  (regla 9 — no se anticipa sin necesidad concreta).
- **`CSPProvider` de base-ui.** Si algún día se endurece `style-src` en
  `src/middleware.ts` más allá de `'unsafe-inline'`, los componentes de
  base-ui que abren portal (`AlertDialog`) van a necesitar
  `@base-ui/react/csp-provider` con el nonce de `x-nonce`. Verificado
  presente en la versión instalada (`@base-ui/react@1.7.0`); no se activa
  hasta que haga falta.
