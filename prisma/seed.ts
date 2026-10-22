/**
 * Idempotente y aditivo — no asume una BD vacía.
 * Este seed inicializa:
 * 1. Un usuario admin inicial si no existe ninguno.
 * 2. Un catálogo de artículos base con sus respectivos movimientos de stock.
 * 3. Clientes de prueba (@seed.invalid) para verificar casos borde (enganche, sobrepago, devolución).
 *
 * Uso: npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/bcrypt";
import { crearCliente } from "@/server/services/clientes";
import { crearVenta } from "@/server/services/ventas";
import { crearPago } from "@/server/services/pagos";
import { crearDevolucion } from "@/server/services/devoluciones";
import type { Rol } from "@/types/dominio";

const prisma = new PrismaClient();
const MARCA_SEED = "@seed.invalid";

async function asegurarAdmin() {
  const existeAdmin = await prisma.usuario.findFirst({ where: { rol: "admin" } });
  if (existeAdmin) {
    console.log(`Ya existe un admin (${existeAdmin.username}) — no se toca.`);
    return;
  }
  const passwordHash = await hash("Admin123!", 12);
  await prisma.usuario.create({
    data: {
      username: "admin",
      passwordHash,
      nombreCompleto: "Administrador",
      rol: "admin",
      activo: true,
      intentosFallidos: 0,
      creadoEn: new Date(),
    },
  });
  console.log("Admin creado: admin / Admin123!");
}

const ARTICULOS = [
  { nombre: "Vestido floral", precio: "850.00", stock: 12 },
  { nombre: "Blusa manga larga", precio: "420.00", stock: 20 },
  { nombre: "Pantalón de mezclilla", precio: "650.00", stock: 15 },
  { nombre: "Chamarra de piel", precio: "1800.00", stock: 5 },
  { nombre: "Falda plisada", precio: "480.00", stock: 10 },
  { nombre: "Suéter de lana", precio: "620.00", stock: 8 },
  { nombre: "Camisa de vestir", precio: "550.00", stock: 18 },
  { nombre: "Short deportivo", precio: "280.00", stock: 25 },
  { nombre: "Abrigo largo", precio: "2200.00", stock: 4 },
  { nombre: "Playera básica", precio: "180.00", stock: 40 },
  { nombre: "Leggins", precio: "320.00", stock: 30 },
  { nombre: "Bufanda tejida", precio: "150.00", stock: 22 },
];

// Regla 4: todo stock != 0 necesita su movimiento_stock, incluso
// el de alta. `createMany` no lo hace, así que cada fila se crea aparte
// dentro de la misma transacción, con su movimiento.
async function asegurarCatalogo() {
  const total = await prisma.catalogo.count();
  if (total > 0) {
    console.log(`catalogo ya tiene ${total} artículo(s) — no se toca.`);
    return;
  }

  const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: "admin" } });

  await prisma.$transaction(async (tx) => {
    for (const a of ARTICULOS) {
      const articulo = await tx.catalogo.create({
        data: {
          nombre: a.nombre,
          precio: a.precio,
          stock: a.stock,
          stockMinimo: 3,
          activo: true,
          fechaRegistro: new Date(),
        },
      });
      if (a.stock !== 0) {
        await tx.movimientoStock.create({
          data: {
            idCatalogo: articulo.id,
            tipo: "alta_catalogo",
            delta: a.stock,
            actorId: admin.id,
            notas: "Stock inicial de seed.ts",
          },
        });
      }
    }
  });
  console.log(`${ARTICULOS.length} artículos de catálogo creados (con su movimiento_stock).`);
}

// Vía los servicios reales (crearCliente/crearVenta/crearPago/
// crearDevolucion), no prisma.create() directo — así el stock y su
// movimiento_stock quedan consistentes desde el origen (regla 4).
async function asegurarClientesDeCasosRaros() {
  const yaExiste = await prisma.cliente.findFirst({
    where: { email: { endsWith: MARCA_SEED } },
  });
  if (yaExiste) {
    console.log("Clientes de prueba (casos raros) ya existen — no se tocan.");
    return;
  }

  const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: "admin" } });
  const actor = { id: admin.id, rol: admin.rol as Rol };
  const hoy = new Date().toISOString().slice(0, 10);

  const articulo = (nombre: string) =>
    prisma.catalogo.findFirstOrThrow({ where: { nombre } });

  // DatosCliente exige las llaves opcionales presentes (aunque undefined) —
  // así quedó tipado el esquema Zod tras el .transform().
  const datosClienteBase = (nombre: string, email: string) => ({
    nombre,
    email,
    telefono: undefined,
    empresa: undefined,
    calle: undefined,
    numExt: undefined,
    numInt: undefined,
    colonia: undefined,
    municipio: undefined,
    estado: undefined,
    cp: undefined,
  });

  // 1) Venta de contado con enganche.
  const vestido = await articulo("Vestido floral");
  const clienteEnganche = await crearCliente(
    actor,
    datosClienteBase("Seed Enganche", `enganche${MARCA_SEED}`)
  );
  await crearVenta(actor, {
    idCliente: clienteEnganche.id,
    fecha: hoy,
    esquemaPago: "Contado",
    tieneEnganche: true,
    enganche: "400.00",
    articulos: [
      { idCatalogo: vestido.id, nombre: vestido.nombre, cantidad: 1, precioUnitario: "1200.00" },
    ],
  });

  // 2) Saldo negativo por sobrepago.
  const playera = await articulo("Playera básica");
  const clienteSobrepago = await crearCliente(
    actor,
    datosClienteBase("Seed Sobrepago", `sobrepago${MARCA_SEED}`)
  );
  await crearVenta(actor, {
    idCliente: clienteSobrepago.id,
    fecha: hoy,
    esquemaPago: "Pagos",
    frecuenciaPago: "Semanal",
    tieneEnganche: false,
    articulos: [
      { idCatalogo: playera.id, nombre: playera.nombre, cantidad: 1, precioUnitario: "500.00" },
    ],
  });
  await crearPago(actor, {
    idCliente: clienteSobrepago.id,
    fecha: hoy,
    monto: "700.00",
    metodoPago: "Efectivo",
    referencia: undefined,
    notas: "Sobrepago intencional — cliente de prueba (seed)",
  });

  // 3) Devolución total.
  const bufanda = await articulo("Bufanda tejida");
  const clienteDevolucionTotal = await crearCliente(
    actor,
    datosClienteBase("Seed Devolucion Total", `devoluciontotal${MARCA_SEED}`)
  );
  await crearVenta(actor, {
    idCliente: clienteDevolucionTotal.id,
    fecha: hoy,
    esquemaPago: "Contado",
    tieneEnganche: false,
    articulos: [
      { idCatalogo: bufanda.id, nombre: bufanda.nombre, cantidad: 2, precioUnitario: "150.00" },
    ],
  });
  await crearDevolucion(actor, {
    idCliente: clienteDevolucionTotal.id,
    fecha: hoy,
    motivo: "Devolución total — cliente de prueba (seed)",
    articulos: [
      { idCatalogo: bufanda.id, nombre: bufanda.nombre, cantidad: 2, precioUnitario: "150.00" },
    ],
  });

  console.log(
    "3 clientes de casos raros creados: enganche, sobrepago (saldo negativo), devolución total."
  );
}

async function main() {
  await asegurarAdmin();
  await asegurarCatalogo();
  await asegurarClientesDeCasosRaros();
}

main()
  .catch((err) => {
    console.error("Error corriendo el seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
