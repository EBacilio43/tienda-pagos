import { test, expect } from "@playwright/test";
import { CLIENTE_E2E } from "./global-setup";
import { entrar, visible } from "./apoyo";

// Pruebas funcionales del calendario de /actividad en el navegador para verificar
// renderizado responsivo y navegacion entre meses y vistas.
//
// La venta del seed es del 2026-01-15, así que el mes se pide por URL en
// vez de depender de en qué mes se corra la prueba.
const MES = "2026-01";
const DIA = "2026-01-15";

test.beforeEach(async ({ page }) => {
  await entrar(page);
});

test("el alternador lleva del feed al calendario y de vuelta", async ({ page }) => {
  await page.goto("/actividad");
  await page.getByRole("link", { name: "Calendario" }).click();

  await expect(page).toHaveURL(/vista=calendario/);
  await expect(page.getByText("Elige un día para ver sus movimientos")).toBeVisible();

  await page.getByRole("link", { name: "Feed" }).click();
  await expect(page).toHaveURL(/\/actividad$/);
});

test("la celda del día muestra el cargo y al tocarla lista el movimiento", async ({ page }) => {
  await page.goto(`/actividad?vista=calendario&mes=${MES}`);

  await expect(page.getByRole("heading", { name: /enero 2026/i })).toBeVisible();

  // La celda del 15 trae la venta de $1,000.00 del seed.
  const celda = page.locator(`a[href*="dia=${DIA}"]`);
  await expect(celda).toContainText("$1,000.00");

  await celda.click();
  await expect(page).toHaveURL(new RegExp(`dia=${DIA}`));

  // Encabezado del día y el movimiento listado. Que diga "15 de enero" y no
  // "14" es la regla 2 funcionando de punta a punta: la columna es DATE,
  // Prisma la da a medianoche UTC y México es UTC−6.
  await expect(page.getByRole("heading", { name: /15 de enero de 2026/i })).toBeVisible();
  await expect(visible(page.getByText(CLIENTE_E2E.nombre))).toBeVisible();
});

test("el enlace de un día es compartible: recargar lo conserva", async ({ page }) => {
  // Es la razón por la que el día vive en la URL y no en un useState — la
  // decisión de diseño de esta pantalla.
  await page.goto(`/actividad?vista=calendario&mes=${MES}&dia=${DIA}`);
  await expect(page.getByRole("heading", { name: /15 de enero de 2026/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /15 de enero de 2026/i })).toBeVisible();
});

test("navegar de mes conserva la vista de calendario", async ({ page }) => {
  await page.goto(`/actividad?vista=calendario&mes=${MES}`);
  await page.getByLabel("Mes siguiente").click();

  await expect(page.getByRole("heading", { name: /febrero 2026/i })).toBeVisible();
  await expect(page).toHaveURL(/vista=calendario/);

  await page.getByLabel("Mes anterior").click();
  await expect(page.getByRole("heading", { name: /enero 2026/i })).toBeVisible();
});

test("un mes vacío no revienta ni inventa celdas", async ({ page }) => {
  await page.goto("/actividad?vista=calendario&mes=2019-03");

  await expect(page.getByRole("heading", { name: /marzo 2019/i })).toBeVisible();
  // Marzo de 2019 arranca en viernes: la cuadrícula existe aunque no haya
  // un solo movimiento, y ninguna celda es un enlace.
  await expect(page.locator('a[href*="dia="]')).toHaveCount(0);
});

// Una URL la escribe cualquiera. `parsearMes`/`parsearDia` tienen sus
// pruebas unitarias; esto comprueba que la página respeta lo que devuelven
// en vez de reventar con un Invalid Date.
test("un mes inválido en la URL cae al mes en curso sin romperse", async ({ page }) => {
  const respuesta = await page.goto("/actividad?vista=calendario&mes=2026-13");
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "Calendario" })).toBeVisible();
});

test("el calendario se ve sin scroll horizontal en un teléfono", async ({ page }) => {
  // 360 px es el ancho que el barrido móvil de la entrada 24 tomó como
  // referencia. El desbordamiento horizontal fue el defecto que más veces
  // volvió en esa tanda, y se medía a ojo.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/actividad?vista=calendario&mes=${MES}&dia=${DIA}`);

  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(desborde).toBe(false);
});
