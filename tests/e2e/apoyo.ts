import { expect, type Page, type Locator } from "@playwright/test";
import { CREDENCIALES } from "./global-setup";

// El primer login de una corrida tarda MUCHO más que los siguientes, y por
// dos motivos que se suman: `next dev` compila la ruta la primera vez que
// alguien la pide, y `verificarPassword` es bcrypt a 12 rounds (ADR-15),
// que cuesta cientos de milisegundos a propósito. Con el timeout de 5 s por
// defecto, la primera prueba del archivo fallaba con el botón todavía en
// "Entrando…" mientras las siguientes pasaban — un rojo que parece un bug
// de la app y es el arranque en frío del servidor de desarrollo.
//
// No se baja el costo de bcrypt para acomodar la prueba: es la defensa real
// contra fuerza bruta, y una prueba que la desactiva deja de medir el
// login que corre en producción.
const TIMEOUT_LOGIN = 60_000;

export async function entrar(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(CREDENCIALES.usuario);
  await page.getByLabel("Contraseña").fill(CREDENCIALES.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // A la raíz, que es el dashboard. Si las credenciales fallaran, la URL se
  // quedaría en /login y esto reventaría con el texto del error a la vista.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: TIMEOUT_LOGIN,
  });
  await expect(page.getByRole("button", { name: "Entrando…" })).toHaveCount(0);
}

/**
 * El primero de los elementos que coinciden Y están visibles.
 *
 * Hace falta porque en el diseño responsivo casi toda lista se pinta DOS veces en el DOM —tabla para pantallas
 * anchas, tarjetas para el teléfono— y una de las dos está siempre oculta
 * por CSS. `getByText(...).first()` cae en la copia oculta según cuál venga
 * antes en el marcado, que es un detalle de implementación: la prueba
 * fallaba con el elemento correcto resuelto y en estado "hidden".
 */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}
