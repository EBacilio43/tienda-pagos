import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // AGENTS.md regla 6: @/server nunca se importa desde un Client Component
  // — salvo @/server/actions/*, el puente "use server" deliberado entre
  // formularios cliente y Server Actions (Next.js las convierte en una
  // referencia RPC, no en código empaquetado). Todo lo demás en server/
  // (db, auth, services, audit, pdf) sí movería código o secretos al
  // bundle. Los Client Components viven en src/components/**. El respaldo
  // real (para cualquier "use client" fuera de ahí) es el paquete
  // `server-only` en cada barrel de src/server/, que revienta el build.
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/server/db",
                "@/server/db/*",
                "@/server/auth",
                "@/server/auth/*",
                "@/server/services",
                "@/server/services/*",
                "@/server/audit",
                "@/server/audit/*",
                "@/server/pdf",
                "@/server/pdf/*",
              ],
              message:
                "Un Client Component no puede importar server/db, server/auth, server/services, server/audit ni server/pdf — moveria codigo o secretos de servidor al bundle del cliente. Solo @/server/actions/* (Server Actions) esta permitido.",
            },
          ],
        },
      ],
    },
  },
  // AGENTS.md regla 10: un color literal existe en un solo modo (claro u
  // oscuro); un token de globals.css existe en los dos. Una clase de
  // paleta de Tailwind o un hex se ven bien en un modo y son ilegibles en
  // el otro, y nada lo detecta hasta que alguien abre la pantalla en ese
  // modo — esto lo detecta en el commit. Cubre className="...", cn("..."),
  // cva(...) y los template literals con clases estáticas. Única excepción:
  // src/server/pdf/*, que no puede leer variables CSS — ahí los hexes
  // viven solo en paleta.ts, y scripts/verificar-paleta.ts prueba que son
  // la conversión exacta de globals.css.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/pdf/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(?:^|[\\s\"'`])(?:text|bg|border|ring|fill|stroke|from|via|to|decoration|outline|accent|caret|divide|placeholder|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)(?:\\/\\d{1,3})?\\b/]",
          message:
            "AGENTS.md regla 10: sin clases de paleta de Tailwind (ej. text-red-600). Usa un token semantico de globals.css (primary, muted, destructive, venta, enganche, abono, devolucion, saldo, exito) o agrega uno nuevo en los DOS modos (claro y oscuro).",
        },
        {
          selector: "TemplateElement[value.raw=/(?:^|[\\s])(?:text|bg|border|ring|fill|stroke|from|via|to|decoration|outline|accent|caret|divide|placeholder|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)\\b/]",
          message:
            "AGENTS.md regla 10: sin clases de paleta de Tailwind dentro de un template literal. Usa un token semantico de globals.css.",
        },
        {
          selector: "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            "AGENTS.md regla 10: sin colores hex inline. Usa un token semantico de globals.css — la unica excepcion es src/server/pdf/paleta.ts.",
        },
      ],
    },
  },
]);

export default eslintConfig;
