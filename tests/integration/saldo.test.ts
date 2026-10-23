import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { obtenerSaldo, obtenerSaldos, obtenerTodosLosSaldos, obtenerResumenSaldo } from "@/server/services/saldo";

// AGENTS.md regla 3 + docs/DOMINIO.md: la fórmula vive en la vista SQL
// v_saldos_cliente (prisma/views/v_saldos_cliente.sql), no en TypeScript —
// por eso esto es una prueba de integración contra Postgres real, no una
// prueba pura. Casos tomados directo de la tabla de "Semántica de cada
// movimiento" del dominio.
describe("fórmula del saldo (v_saldos_cliente)", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  async function crearCliente(nombre: string) {
    return prisma.cliente.create({ data: { nombre } });
  }

  it("saldo = ventas - pagos - devoluciones - enganches", async () => {
    const cliente = await crearCliente("Cliente Formula");
    await prisma.venta.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-01-01T00:00:00Z"), montoTotal: "1000.00" },
    });
    await prisma.pago.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-01-05T00:00:00Z"), monto: "300.00" },
    });
    await prisma.devolucion.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-01-10T00:00:00Z"), montoCredito: "100.00" },
    });

    const saldo = await obtenerSaldo(cliente.id);
    expect(saldo.toFixed(2)).toBe("600.00");
  });

  it("el enganche solo se resta cuando tiene_enganche = true", async () => {
    const cliente = await crearCliente("Cliente Enganche");
    // Enganche con tieneEnganche=false: NO debe restarse aunque el campo
    // tenga un valor — es exactamente el caso que el legacy manejaba mal.
    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-01T00:00:00Z"),
        montoTotal: "1000.00",
        tieneEnganche: false,
        enganche: "200.00",
      },
    });
    expect((await obtenerSaldo(cliente.id)).toFixed(2)).toBe("1000.00");

    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-02T00:00:00Z"),
        montoTotal: "500.00",
        tieneEnganche: true,
        enganche: "150.00",
      },
    });
    // 1000 (venta 1, sin enganche efectivo) + 500 - 150 (venta 2, con enganche)
    expect((await obtenerSaldo(cliente.id)).toFixed(2)).toBe("1350.00");
  });

  it("saldo negativo cuando el cliente pagó de más — no se trunca en 0", async () => {
    const cliente = await crearCliente("Cliente A Favor");
    await prisma.venta.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-01-01T00:00:00Z"), montoTotal: "100.00" },
    });
    await prisma.pago.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-01-02T00:00:00Z"), monto: "250.00" },
    });

    const saldo = await obtenerSaldo(cliente.id);
    expect(saldo.toFixed(2)).toBe("-150.00");
    expect(saldo.isNegative()).toBe(true);
  });

  it("cliente sin ningún movimiento tiene saldo 0, no null/undefined", async () => {
    const cliente = await crearCliente("Cliente Sin Movimientos");
    const saldo = await obtenerSaldo(cliente.id);
    expect(saldo.toFixed(2)).toBe("0.00");
  });

  it("cliente inexistente da 0 (no revienta)", async () => {
    const saldo = await obtenerSaldo(999999);
    expect(saldo.toFixed(2)).toBe("0.00");
  });

  it("obtenerSaldos (varios clientes) coincide con obtenerSaldo (uno a uno)", async () => {
    const a = await crearCliente("Cliente Lote A");
    const b = await crearCliente("Cliente Lote B");
    await prisma.venta.create({
      data: { idCliente: a.id, fecha: new Date("2026-01-01T00:00:00Z"), montoTotal: "500.00" },
    });
    await prisma.pago.create({
      data: { idCliente: b.id, fecha: new Date("2026-01-01T00:00:00Z"), monto: "50.00" },
    });

    const individuales = new Map([
      [a.id, await obtenerSaldo(a.id)],
      [b.id, await obtenerSaldo(b.id)],
    ]);
    const enLote = await obtenerSaldos([a.id, b.id]);

    expect(enLote.get(a.id)?.toFixed(2)).toBe(individuales.get(a.id)?.toFixed(2));
    expect(enLote.get(b.id)?.toFixed(2)).toBe(individuales.get(b.id)?.toFixed(2));
  });

  it("obtenerTodosLosSaldos incluye a todos los clientes, incluso sin movimientos", async () => {
    const conMovimiento = await crearCliente("Con Movimiento");
    const sinMovimiento = await crearCliente("Sin Movimiento");
    await prisma.venta.create({
      data: { idCliente: conMovimiento.id, fecha: new Date("2026-01-01T00:00:00Z"), montoTotal: "100.00" },
    });

    const todos = await obtenerTodosLosSaldos();
    expect(todos.get(conMovimiento.id)?.toFixed(2)).toBe("100.00");
    expect(todos.get(sinMovimiento.id)?.toFixed(2)).toBe("0.00");
  });

  it("obtenerResumenSaldo desglosa los mismos cuatro términos que suman el saldo de la vista", async () => {
    const cliente = await crearCliente("Cliente Resumen");
    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-01T00:00:00Z"),
        montoTotal: "1000.00",
        tieneEnganche: true,
        enganche: "100.00",
      },
    });
    await prisma.pago.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-01-05T00:00:00Z"), monto: "200.00" },
    });
    await prisma.devolucion.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-01-10T00:00:00Z"), montoCredito: "50.00" },
    });

    const resumen = await obtenerResumenSaldo(cliente.id);
    expect(resumen.totalVentas).toBe("1000.00");
    expect(resumen.totalEnganches).toBe("100.00");
    expect(resumen.totalPagos).toBe("200.00");
    expect(resumen.totalDevoluciones).toBe("50.00");
    // El saldo del resumen tiene que ser EXACTAMENTE el de la vista — no
    // una resta hecha aparte con estos mismos cuatro números (regla 3: la
    // vista es la única fuente, el resumen no reimplementa la fórmula).
    expect(resumen.saldo).toBe((await obtenerSaldo(cliente.id)).toFixed(2));
    expect(resumen.saldo).toBe("650.00");
  });
});

// beforeEach limpia ANTES de cada prueba, no después de la última — sin
// esto, lo que deja la última prueba de la última suite en correr queda en
// la base de prueba y confunde a lo que corra después en el mismo job de CI
// (prisma/seed.ts espera una base vacía o ya sembrada por completo, no a
// medias). Visto en vivo: CI falló en "Sembrar datos de prueba" porque
// quedó 1 artículo huérfano de una prueba anterior.
afterAll(async () => {
  await limpiarBaseDePrueba();
});
