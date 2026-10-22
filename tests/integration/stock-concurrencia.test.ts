import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { ajustarStock } from "@/server/services/stock";

const ADMIN = { id: 1, rol: "admin" as const };

async function crearUsuarioAdmin() {
  await prisma.usuario.create({
    data: {
      id: 1,
      username: "admin_t",
      nombreCompleto: "Admin Test",
      rol: "admin",
      passwordHash: "x",
      activo: true,
      intentosFallidos: 0,
      creadoEn: new Date(),
    },
  });
}

// ajustarStockTx hacía leer-calcular-escribir (findUnique +
// update con el valor calculado en memoria) — bajo concurrencia real, dos
// transacciones pueden leer el mismo `stock` viejo antes de que ninguna
// escriba, y una pisa el resultado de la otra (lost update). Estas pruebas
// disparan `ajustarStock` de verdad en paralelo (cada llamada abre su
// propia transacción — `Promise.all`, no un loop secuencial) contra el
// MISMO artículo, para que la condición de carrera tenga oportunidad real
// de manifestarse si el fix no fuera atómico.
describe("ajustarStock — concurrencia real (a)", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
    await crearUsuarioAdmin();
  });

  it("20 decrementos concurrentes de 1 no pierden ninguna escritura", async () => {
    const articulo = await prisma.catalogo.create({
      data: { nombre: "Artículo concurrencia", precio: "10.00", stock: 100 },
    });

    await Promise.all(
      Array.from({ length: 20 }, () =>
        ajustarStock(ADMIN, { idCatalogo: articulo.id, delta: -1, tipo: "ajuste_manual" })
      )
    );

    const final = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(final.stock).toBe(80);

    const movimientos = await prisma.movimientoStock.findMany({ where: { idCatalogo: articulo.id } });
    expect(movimientos).toHaveLength(20);
    const sumaDeltas = movimientos.reduce((acc, m) => acc + m.delta, 0);
    expect(sumaDeltas).toBe(-20);
    // La invariante de la regla 4, exactamente como la vigila verificar-stock.ts.
    expect(final.stock).toBe(sumaDeltas + 100);
  });

  it("mezcla de incrementos y decrementos concurrentes cuadra exacto", async () => {
    const articulo = await prisma.catalogo.create({
      data: { nombre: "Artículo mixto", precio: "10.00", stock: 50 },
    });

    const deltas = [5, -3, 2, -7, 10, -1, -4, 6, -2, 1];
    await Promise.all(
      deltas.map((delta) => ajustarStock(ADMIN, { idCatalogo: articulo.id, delta, tipo: "ajuste_manual" }))
    );

    const final = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    const esperado = 50 + deltas.reduce((a, b) => a + b, 0);
    expect(final.stock).toBe(esperado);
  });

  it("bajo concurrencia, nunca deja el stock en negativo — el exceso se rechaza, no se pierde", async () => {
    const articulo = await prisma.catalogo.create({
      data: { nombre: "Artículo escaso", precio: "10.00", stock: 5 },
    });

    const resultados = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        ajustarStock(ADMIN, { idCatalogo: articulo.id, delta: -1, tipo: "ajuste_manual" })
      )
    );

    const exitosos = resultados.filter((r) => r.status === "fulfilled").length;
    const rechazados = resultados.filter((r) => r.status === "rejected").length;

    expect(exitosos).toBe(5);
    expect(rechazados).toBe(5);

    const final = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(final.stock).toBe(0);
    expect(final.stock).toBeGreaterThanOrEqual(0);

    // Los 5 rechazados no debieron dejar movimiento_stock huérfano.
    const movimientos = await prisma.movimientoStock.findMany({ where: { idCatalogo: articulo.id } });
    expect(movimientos).toHaveLength(5);
  });

  it("el CHECK de la base (b) es la segunda red — rechaza un UPDATE directo que deje stock negativo", async () => {
    const articulo = await prisma.catalogo.create({
      data: { nombre: "Artículo con CHECK", precio: "10.00", stock: 3 },
    });

    await expect(
      prisma.$executeRawUnsafe(`UPDATE catalogo SET stock = -1 WHERE id = ${articulo.id}`)
    ).rejects.toThrow();

    const sinCambio = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(sinCambio.stock).toBe(3);
  });
});

// Ver la nota en saldo.test.ts.
afterAll(async () => {
  await limpiarBaseDePrueba();
});
