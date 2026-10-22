import { test, expect } from "@playwright/test";
import { CLIENTE_E2E } from "./global-setup";
import { entrar, visible } from "./apoyo";

// El flujo que pedía , literal: login → registrar abono →
// ver el saldo actualizado. Vale la pena decir por qué este y no otro —
// atraviesa las cuatro reglas duras que más cuestan si se rompen: la sesión
// (regla 7), el dinero como string (regla 1), la fecha DATE sin correrse un
// día (regla 2) y el saldo calculado en un solo lugar (regla 3). Ninguna
// prueba de integración lo ve entero, porque entre el servicio y la
// pantalla hay una frontera RSC que solo un navegador cruza de verdad.

test("sin sesión, la app manda al login", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login/);
});

test("login, registrar un abono y ver el saldo bajar", async ({ page }) => {
  await entrar(page);

  // A la ficha del cliente por la interfaz, no con un goto directo a la
  // URL: navegar es parte de lo que se está probando.
  await page.goto("/clientes");
  await visible(page.getByRole("link", { name: new RegExp(CLIENTE_E2E.nombre) })).click();
  await expect(page).toHaveURL(/\/clientes\/\d+/);

  const idCliente = page.url().match(/\/clientes\/(\d+)/)![1];
  const saldo = page.locator("p").filter({ hasText: "= Saldo Pendiente" }).locator("+ p");

  await expect(saldo).toContainText(`$${CLIENTE_E2E.saldoInicial}`);

  await page.goto(`/pagos/nuevo?clienteId=${idCliente}`);

  // La fecha la propone `<CampoFecha>` despues de montar. Que aqui venga llena
  // es la prueba de que el valor inicial se asigna correctamente.
  await expect(page.locator("#fecha")).not.toHaveValue("");

  await page.locator("#monto").fill(CLIENTE_E2E.abono);
  await page.getByRole("button", { name: "Registrar pago" }).click();

  // La acción hace redirect() a la ficha del cliente.
  await expect(page).toHaveURL(new RegExp(`/clientes/${idCliente}`));

  // El saldo lo recalcula `v_saldos_cliente` (regla 3), no la pantalla.
  await expect(saldo).toContainText(`$${CLIENTE_E2E.saldoFinal}`);
});

test("el abono registrado aparece en el feed de actividad", async ({ page }) => {
  await entrar(page);
  await page.goto("/actividad");

  await expect(visible(page.getByText(CLIENTE_E2E.nombre))).toBeVisible();
  await expect(visible(page.getByText("Abono", { exact: true }))).toBeVisible();
});
