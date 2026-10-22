/**
 * Fase 9 / ADR-17. El tema "sistema" se resuelve con una rama
 * `@media (prefers-color-scheme: dark)` que duplica a mano el bloque de
 * `.dark` en src/app/globals.css (ver el comentario junto a
 * `@custom-variant dark` sobre por qué no se usa `light-dark()`). Esa
 * duplicación es la única del sistema de tokens, y este script es lo que
 * la compensa: si alguien edita un bloque y se le olvida el otro, esto
 * falla en vez de quedar como una divergencia silenciosa entre "oscuro"
 * elegido a mano y "sistema".
 *
 * Sin Prisma, sin red.
 *
 * Uso: npx tsx scripts/verificar-tokens.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function extraerBloque(css: string, inicioMarca: string): string {
  const inicio = css.indexOf(inicioMarca);
  if (inicio === -1) throw new Error(`No se encontró "${inicioMarca}" en globals.css`);
  const aperturaLlave = css.indexOf("{", inicio);
  let profundidad = 1;
  let i = aperturaLlave + 1;
  while (profundidad > 0 && i < css.length) {
    if (css[i] === "{") profundidad += 1;
    if (css[i] === "}") profundidad -= 1;
    i += 1;
  }
  return css.slice(aperturaLlave + 1, i - 1);
}

function extraerTokens(bloque: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const regex = /--([\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(bloque))) {
    tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

function main() {
  const rutaCss = join(__dirname, "..", "src", "app", "globals.css");
  const css = readFileSync(rutaCss, "utf-8");

  const bloqueDark = extraerBloque(css, "\n.dark {");
  const bloqueMedia = extraerBloque(css, ":root:not(.light):not(.dark) {");

  const tokensDark = extraerTokens(bloqueDark);
  const tokensMedia = extraerTokens(bloqueMedia);

  const diffs: string[] = [];

  for (const [nombre, valor] of tokensDark) {
    if (!tokensMedia.has(nombre)) {
      diffs.push(`--${nombre} está en .dark pero no en la rama @media`);
    } else if (tokensMedia.get(nombre) !== valor) {
      diffs.push(
        `--${nombre} difiere: .dark = "${valor}", @media = "${tokensMedia.get(nombre)}"`
      );
    }
  }
  for (const nombre of tokensMedia.keys()) {
    if (!tokensDark.has(nombre)) {
      diffs.push(`--${nombre} está en la rama @media pero no en .dark`);
    }
  }

  if (diffs.length > 0) {
    console.error(`✗ ${diffs.length} divergencia(s) entre .dark y la rama @media:\n`);
    for (const d of diffs) console.error(`  - ${d}`);
    process.exit(1);
  }

  console.log(
    `✓ .dark y la rama @media (prefers-color-scheme: dark) declaran los mismos ${tokensDark.size} tokens.`
  );
}

main();
