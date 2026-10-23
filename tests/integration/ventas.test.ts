import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { crearVenta, actualizarVenta, eliminarVenta } from "@/server/services/ventas";
import { ErrorPermiso } from "@/lib/permisos";
import type { DatosVenta } from "@/lib/schemas/venta";

const ADMIN = { id: 1, rol: "admin" as const };
const OPERADOR = { id: 2, rol: "operador" as const };
const CONSULTA = { id: 3, rol: "consulta" as const };

async function crearClienteYUsuarios() {
  const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Ventas" } });
  const base = { passwordHash: "x", activo: true, intentosFallidos: 0, creadoEn: new Date() };
  await prisma.usuario.createMany({
    data: [
      { id: 1, username: "admin_t", nombreCompleto: "Admin Test", rol: "admin", ...base },
      { id: 2, username: "operador_t", nombreCompleto: "Operador Test", rol: "operador", ...base },
      { id: 3, username: "consulta_t", nombreCompleto: "Consulta Test", rol: "consulta", ...base },
    ],
  });
  return cliente;
}

async function crearArticuloCatalogo(stock: number) {
  return prisma.catalogo.create({ data: { nombre: "Aretes de prueba", precio: "500.00", stock } });
}

describe("crearVenta", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("descuenta stock e inserta auditoría en la MISMA transacción (regla 4 + regla 5)", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 3, precioUnitario: "500.00" }],
    };

    const { id: ventaId } = await crearVenta(ADMIN, datos);

    const catalogoActualizado = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(catalogoActualizado.stock).toBe(7);

    const movimientos = await prisma.movimientoStock.findMany({ where: { idCatalogo: articulo.id } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].delta).toBe(-3);
    expect(movimientos[0].referenciaId).toBe(ventaId);

    const auditoria = await prisma.auditoria.findMany({ where: { tablaAfectada: "ventas" } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].usuarioId).toBe(ADMIN.id);
    expect(auditoria[0].registroId).toBe(String(ventaId));
    // regla 5: registro_id nunca null en un INSERT de auditoría.
    expect(auditoria[0].registroId).not.toBeNull();
  });

  it("un rol sin permiso (consulta) recibe ErrorPermiso y no escribe nada", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "500.00" }],
    };

    await expect(crearVenta(CONSULTA, datos)).rejects.toThrow(ErrorPermiso);

    expect(await prisma.venta.count()).toBe(0);
    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(10);
  });

  it("operador SÍ puede (la matriz de permisos no es solo admin)", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "500.00" }],
    };

    await expect(crearVenta(OPERADOR, datos)).resolves.toMatchObject({ id: expect.any(Number) });
  });

  it("rechaza vender más de lo que hay en stock, y no deja escritura parcial", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(2);

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 5, precioUnitario: "500.00" }],
    };

    await expect(crearVenta(ADMIN, datos)).rejects.toThrow(/stock insuficiente/i);

    // La transacción completa se revierte: ni la venta ni el movimiento
    // de stock quedan a medias.
    expect(await prisma.venta.count()).toBe(0);
    expect(await prisma.movimientoStock.count()).toBe(0);
    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(2);
  });

  it("un artículo SIN idCatalogo (pieza libre) no mueve stock ni revienta", async () => {
    const cliente = await crearClienteYUsuarios();

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: null, nombre: "Anillo único", cantidad: 1, precioUnitario: "1500.00" }],
    };

    const { id: ventaId } = await crearVenta(ADMIN, datos);

    expect(await prisma.movimientoStock.count()).toBe(0);
    const venta = await prisma.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: { ventaArticulos: true },
    });
    expect(venta.montoTotal?.toFixed(2)).toBe("1500.00");
    expect(venta.ventaArticulos[0].idCatalogo).toBeNull();
  });

  it("montoTotal se deriva de Σ artículos, no de un campo aparte (docs/DOMINIO.md)", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [
        { idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 2, precioUnitario: "500.00" },
        { idCatalogo: null, nombre: "Libre", cantidad: 1, precioUnitario: "250.00" },
      ],
    };

    const { id: ventaId } = await crearVenta(ADMIN, datos);
    const venta = await prisma.venta.findUniqueOrThrow({ where: { id: ventaId } });
    expect(venta.montoTotal?.toFixed(2)).toBe("1250.00");
  });
});

describe("actualizarVenta", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("editar una venta revierte el stock anterior antes de aplicar el nuevo", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    const { id: ventaId } = await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 4, precioUnitario: "500.00" }],
    });
    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(6);

    // Reduce la cantidad de 4 a 1 — el stock debe subir de 6 a 9, no
    // quedarse en 6 ni descontar 1 más sobre el ya descontado.
    await actualizarVenta(ADMIN, ventaId, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "500.00" }],
    });

    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(9);
  });

  it("un rol sin permiso no puede editar", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);
    const { id: ventaId } = await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "500.00" }],
    });

    await expect(
      actualizarVenta(CONSULTA, ventaId, {
        idCliente: cliente.id,
        fecha: "2026-01-01",
        esquemaPago: "Contado",
        tieneEnganche: false,
        articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 2, precioUnitario: "500.00" }],
      })
    ).rejects.toThrow(ErrorPermiso);
  });
});

describe("eliminarVenta", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("repone el stock al eliminar", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);
    const { id: ventaId } = await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 4, precioUnitario: "500.00" }],
    });
    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(6);

    await eliminarVenta(ADMIN, ventaId);

    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(10);
    expect(await prisma.venta.count()).toBe(0);
    // La venta se borró pero la auditoría de la eliminación queda.
    const auditoria = await prisma.auditoria.findMany({
      where: { tablaAfectada: "ventas", accion: "eliminar" },
    });
    expect(auditoria).toHaveLength(1);
  });
});

// Ver la nota en saldo.test.ts: beforeEach limpia antes de cada prueba,
// no después de la última — esto asegura que lo que quede en la base de prueba
// al terminar este archivo no confunda a lo que corra después (CI corre
// prisma/seed.ts justo después de las pruebas de integración).
afterAll(async () => {
  await limpiarBaseDePrueba();
});
