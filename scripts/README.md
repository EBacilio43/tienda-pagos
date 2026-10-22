# scripts — verificación e higiene

Todos corren con `tsx` (`npx tsx scripts/<archivo>.ts`, o su alias en
`package.json` si tiene uno) dentro del contenedor. Ninguno
importa `next` — corren como Node plano, por eso `server/db/prisma.ts` no
lleva `import "server-only"`.

| Script | Alias en `package.json` | Qué hace | Tipo de operación |
|---|---|---|---|
| `verificar-saldos.ts` | `verificar-saldos` | Regla 3: reconstruye el saldo de cada cliente desde cero (ventas − pagos − devoluciones − enganches) y lo compara contra `v_saldos_cliente` y contra el ledger del PDF. Falla si diverge | Solo lectura |
| `verificar-stock.ts` | `verificar-stock` | Regla 4: `catalogo.stock == Σ movimientos_stock.delta` para cada artículo | Solo lectura |
| `verificar-paleta.ts` | — | Convierte los `oklch(...)` de `globals.css` a sRGB y compara contra `server/pdf/paleta.ts` — sin esto, la paleta del PDF puede divergir de la app en silencio | No usa BD |
| `verificar-tokens.ts` | — | Compara el bloque `.dark` de `globals.css` contra la rama `@media (prefers-color-scheme: dark)` — son la misma info duplicada a mano por cómo se resuelve el tema "sistema", y este script es lo que evita que diverjan | No usa BD |
| `podar-logs.ts` | `podar-logs` | Retención de `sesiones_log` (90 días) y `auditoria` (2 años). Dry-run por default, `--aplicar` para borrar de verdad | Escribe si `--aplicar` |
| `detectar-clientes-duplicados.ts` | `detectar-duplicados` | Homónimos por nombre (exacto y laxo — mayúsculas/espacios/acentos) | Solo lectura |
