import { defineConfig } from "vitest/config";
import path from "node:path";

// Mismo alias que tsconfig.json (`@/*` -> `./src/*`) resuelto a mano en vez
// de sumar vite-tsconfig-paths como dependencia nueva solo para esto.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // `server-only` lanza a propósito cuando lo resuelve algo que no es el
      // bundler de Next en condición "react-server": así es como impide que
      // un módulo de servidor acabe en el bundle del cliente. En Vitest
      // (Node plano, sin bundle de cliente) eso solo bloquea — y era la
      // razón real por la que `server/auth/*` no tenía UNA sola prueba, que
      // es el hueco que señala como el más caro que
      // quedaba. Ver tests/stubs/server-only.ts.
      "server-only": path.resolve(import.meta.dirname, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
