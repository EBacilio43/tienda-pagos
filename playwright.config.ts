import { defineConfig, devices } from "@playwright/test";

// Suite de pruebas E2E (punta a punta) para verificar flujos criticos de navegador
// que no se pueden detectar con pruebas unitarias o de integracion (hidratacion RSC,
// interacciones reales en el DOM, cabeceras HTTP de previsualizacion).
//
// DÓNDE VIVE: contra `tienda_test`, la MISMA base separada que usan las
// pruebas de integración, nunca contra la base de desarrollo principal.
// Estos flujos registran abonos de verdad. El servicio `app-e2e` de
// docker-compose.yml existe justo para eso: es la app apuntando a la base de
// prueba, en un puerto distinto al del `npm run dev` de todos los días.
// puerto distinto al del `npm run dev` de todos los días, y
// `tests/e2e/global-setup.ts` repite el guardia de nombre de base antes de
// truncar nada.

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",

  // El flujo de abono atraviesa login en frío, dos navegaciones y una
  // mutación con redirección. En local toma ~20 s, pero en el runner de CI
  // (2 vCPUs compartidos) el timeout por defecto de 30 s se quedaba corto y
  // abortaba la prueba antes de que terminara el ciclo.
  timeout: 60_000,

  // Un solo worker y sin paralelismo entre archivos: los flujos comparten
  // una base y un saldo, y dos abonos simultáneos sobre el mismo cliente
  // harían fallar la aserción del saldo por una carrera de la prueba, no
  // del código. Mismo criterio que `--no-file-parallelism` en las de
  // integración.
  workers: 1,
  fullyParallel: false,

  // En CI un fallo tiene que ser un fallo, no algo que se reintenta hasta
  // ponerse verde: un flujo que solo pasa a la segunda esconde justo la
  // carrera que este tipo de prueba existe para encontrar.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL,
    // Solo cuando algo falla: en verde no deja basura, y en rojo el trace
    // es lo único que explica un fallo dentro de un contenedor sin pantalla.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  // Chromium solo. El navegador real del negocio es Edge, que es Chromium,
  // y sumar Firefox/WebKit triplicaría el tiempo sin cubrir un modo de
  // fallo que este proyecto haya tenido nunca.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Sin `webServer`: el ciclo de vida de la app lo lleva docker-compose
  // (perfil `e2e`), igual que el de la base. Levantarlo desde aquí querría
  // decir un `next dev` fuera de Docker.
});
