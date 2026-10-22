// Fase 9 / ADR-17. ESPEJO EXACTO de los tokens de src/app/globals.css
// (:root) — react-pdf no puede leer variables CSS, así que estos hexes son
// la conversión sRGB de los mismos oklch. Si cambia uno, cambia el otro:
// `npx tsx scripts/verificar-paleta.ts` lo prueba.
export const COLOR = {
  navy900: "#13243d", // --sidebar    oklch(0.259 0.052 258)
  navy700: "#203a5f", // --primary    oklch(0.347 0.073 258)
  ink: "#191e24", // --foreground     oklch(0.232 0.014 258)
  inkSoft: "#5a6370", // --muted-foreground  oklch(0.495 0.024 258)
  line: "#dde3ea", // --border        oklch(0.913 0.012 258)
  paperMuted: "#f4f6f9", // --muted   oklch(0.972 0.005 258)
  venta: "#1853c6", // --venta        oklch(0.48 0.19 262)
  enganche: "#772eba", // --enganche  oklch(0.48 0.205 303)
  abono: "#0b7133", // --abono        oklch(0.48 0.128 150)
  devolucion: "#9f440f", // --devolucion  oklch(0.5 0.135 45)
  saldo: "#b91a1d", // --saldo        oklch(0.505 0.192 27)
  white: "#ffffff",
} as const;
