import { prisma } from "@/server/db/prisma";

// Orden FK-safe para TRUNCATE ... CASCADE (no importa el orden porque
// CASCADE lo resuelve, pero server/services/*.ts documentan este mismo
// orden en otros lados — se mantiene consistente).
const TABLAS = [
  "idempotencia_tokens",
  "auditoria",
  "sesiones_log",
  "sesiones",
  "movimientos_stock",
  "devolucion_articulos",
  "devoluciones",
  "venta_articulos",
  "ventas",
  "pagos",
  "herencias_cuenta",
  "catalogo",
  "usuarios",
  "clientes",
];

// Red de seguridad: un typo en DATABASE_URL al correr las pruebas de
// integracion no debe poder truncar una base principal — por eso esto
// revienta en vez de truncar si el nombre de la base no termina en _test.
function verificarBaseDePrueba(): void {
  const url = process.env.DATABASE_URL ?? "";
  let nombreBase: string;
  try {
    nombreBase = new URL(url).pathname.replace(/^\//, "");
  } catch {
    nombreBase = "";
  }
  if (!nombreBase.endsWith("_test") && !nombreBase.startsWith("tienda_test")) {
    throw new Error(
      `Seguridad: las pruebas de integración solo corren contra bases de prueba ("*_test"), ` +
        `no contra "${nombreBase || "(vacío)"}". DATABASE_URL actual: ${url}. ` +
        `Usa "npm run test:integration" (ya trae la variable correcta) en vez ` +
        `de "vitest" directo.`
    );
  }
}

/**
 * Primer uso en una base nueva (AGENTS.md remite aquí). El orden importa
 * y no es el obvio: `00000000000001_sesiones` hace `DROP TABLE
 * alembic_version` —una tabla que solo existe en el esquema legacy real—,
 * pero crear el stub ANTES del primer `migrate deploy` hace que Prisma
 * aborte con `P3005: the database schema is not empty` sin aplicar nada.
 * La base tiene que empezar vacía. Secuencia comprobada el 2026-09-05:
 *
 *   1. `createdb tienda_test` (vacía, sin una sola tabla).
 *   2. `prisma migrate deploy` — aplica el baseline y falla a propósito en
 *      `00000000000001_sesiones` (`42P01: alembic_version does not exist`).
 *   3. `CREATE TABLE alembic_version (version_num varchar(32) NOT NULL);`
 *   4. `prisma migrate resolve --rolled-back 00000000000001_sesiones` —
 *      sin esto el intento fallido del paso 2 bloquea con `P3009`.
 *   5. `prisma migrate deploy` otra vez — ahora sí, hasta el final.
 */
export async function limpiarBaseDePrueba(): Promise<void> {
  verificarBaseDePrueba();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLAS.join(", ")} RESTART IDENTITY CASCADE`);
}

export { prisma };
