import { hash } from "@node-rs/bcrypt";
import { PrismaClient } from "@prisma/client";

// El estado conocido sobre el que corren los flujos. Se recrea entero en
// cada corrida: un E2E que depende de lo que dejó la corrida anterior falla
// el martes por lo que pasó el lunes.
//
// EL GUARDIA NO ES DECORATIVO. Previene truncar por accidente una base
// que no sea exclusivamente de pruebas (debe terminar en `_test`).
// Es el mismo guardia que tests/integration/setup.ts, repetido a propósito
// en vez de importado: este archivo lo corre Playwright, que no comparte
// configuración con Vitest.

const TABLAS = [
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

export const CREDENCIALES = { usuario: "admin", password: "Admin123!" };

/** El cliente sobre el que corre el flujo de abono. */
export const CLIENTE_E2E = {
  nombre: "Cliente E2E",
  /** Una venta de $1,000.00 sin enganche: el saldo arranca en $1,000.00. */
  venta: "1000.00",
  /** El abono que registra la prueba; deja el saldo en $700.00. */
  abono: "300.00",
  saldoInicial: "1,000.00",
  saldoFinal: "700.00",
};

function exigirBaseDePrueba(): void {
  const url = process.env.DATABASE_URL ?? "";
  let nombreBase: string;
  try {
    nombreBase = new URL(url).pathname.replace(/^\//, "");
  } catch {
    nombreBase = "";
  }
  if (!nombreBase.endsWith("_test") && nombreBase !== "tienda_test") {
    throw new Error(
      `Seguridad: los flujos E2E solo corren contra bases de prueba ("*_test"), no contra ` +
        `"${nombreBase || "(vacío)"}". DATABASE_URL actual: ${url}. Usa ` +
        `"npm run test:e2e" (docker compose --profile e2e), que ya trae la ` +
        `variable correcta.`
    );
  }
}

export default async function globalSetup() {
  exigirBaseDePrueba();

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLAS.join(", ")} RESTART IDENTITY CASCADE`
    );

    // rounds = 12, el mismo de ADR-15 y del seed: bajarlo aquí haría la
    // prueba más rápida y dejaría de ejercitar el costo real del login,
    // que es justo donde vive el freno por intentos fallidos.
    await prisma.usuario.create({
      data: {
        username: CREDENCIALES.usuario,
        passwordHash: await hash(CREDENCIALES.password, 12),
        nombreCompleto: "Administrador E2E",
        rol: "admin",
        activo: true,
        intentosFallidos: 0,
        creadoEn: new Date(),
      },
    });

    const cliente = await prisma.cliente.create({
      data: { nombre: CLIENTE_E2E.nombre },
    });

    // Escritura directa y no `crearVenta`: aquí no se está probando el
    // servicio (eso ya lo hacen las de integración), solo se está poniendo
    // el saldo de partida. El artículo va sin `id_catalogo`, que es la
    // forma real de los datos de producción ().
    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-15T00:00:00Z"),
        fechaRegistroSistema: new Date("2026-01-15T10:00:00Z"),
        montoTotal: CLIENTE_E2E.venta,
        esquemaPago: "Pagos",
        tieneEnganche: false,
        ventaArticulos: {
          create: [{ nombre: "Collar de prueba", cantidad: 1, precioUnitario: CLIENTE_E2E.venta }],
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
