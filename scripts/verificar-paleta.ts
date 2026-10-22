/**
 * Fase 9 / ADR-17. `src/server/pdf/paleta.ts` es un espejo a mano de los
 * tokens OKLCH de `src/app/globals.css` (:root) — react-pdf no puede leer
 * variables CSS, así que esos hexes son la única forma de mantener la
 * invariante "el PDF hereda la paleta de la app, no inventa una nueva"
 * (estado-cuenta.tsx, comentario original de Fase 5). Este script convierte
 * cada oklch(...) de globals.css a sRGB con la conversión estándar
 * OKLab→LMS→sRGB lineal→sRGB con gamma, y compara contra paleta.ts.
 *
 * Sin Prisma, sin red — puede correr en el host, pero se documenta con
 * `docker compose exec app npx tsx scripts/verificar-paleta.ts` por
 * consistencia con el resto de los scripts (Fase 6).
 *
 * Uso: npx tsx scripts/verificar-paleta.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLOR } from "../src/server/pdf/paleta";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Token de globals.css (:root) -> clave de COLOR en paleta.ts.
const MAPA_TOKEN: Record<string, keyof typeof COLOR> = {
  sidebar: "navy900",
  primary: "navy700",
  foreground: "ink",
  "muted-foreground": "inkSoft",
  border: "line",
  muted: "paperMuted",
  venta: "venta",
  enganche: "enganche",
  abono: "abono",
  devolucion: "devolucion",
  saldo: "saldo",
};

function oklchASrgbHex(l: number, c: number, hDeg: number): string {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const gamma = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  const toHex = (v: number) =>
    Math.round(gamma(v) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(rLin)}${toHex(gLin)}${toHex(bLin)}`;
}

function extraerBloqueRoot(css: string): string {
  const inicio = css.indexOf(":root {");
  if (inicio === -1) throw new Error("No se encontró el bloque :root en globals.css");
  const fin = css.indexOf("\n}", inicio);
  return css.slice(inicio, fin);
}

function extraerTokensOklch(bloque: string): Map<string, [number, number, number]> {
  const tokens = new Map<string, [number, number, number]>();
  const regex = /--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(bloque))) {
    tokens.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return tokens;
}

function main() {
  const rutaCss = join(__dirname, "..", "src", "app", "globals.css");
  const css = readFileSync(rutaCss, "utf-8");
  const tokens = extraerTokensOklch(extraerBloqueRoot(css));

  const diffs: string[] = [];

  for (const [token, claveColor] of Object.entries(MAPA_TOKEN)) {
    const valores = tokens.get(token);
    if (!valores) {
      diffs.push(`Token --${token} no encontrado en :root de globals.css`);
      continue;
    }
    const [l, c, h] = valores;
    const hexCalculado = oklchASrgbHex(l, c, h);
    const hexEsperado = COLOR[claveColor].toLowerCase();
    if (hexCalculado !== hexEsperado) {
      diffs.push(
        `--${token} (oklch(${l} ${c} ${h})) => ${hexCalculado}, pero paleta.ts.${claveColor} = ${hexEsperado}`
      );
    }
  }

  if (diffs.length > 0) {
    console.error(`✗ ${diffs.length} divergencia(s) entre globals.css y paleta.ts:\n`);
    for (const d of diffs) console.error(`  - ${d}`);
    console.error(
      "\nsrc/server/pdf/paleta.ts debe ser la conversión sRGB exacta de src/app/globals.css (:root)."
    );
    process.exit(1);
  }

  console.log(`✓ Los ${Object.keys(MAPA_TOKEN).length} colores de paleta.ts coinciden con globals.css (:root).`);
}

main();
