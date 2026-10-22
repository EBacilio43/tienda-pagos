import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { crearVenta } from "@/server/services/ventas";
import { crearPago, crearPagosEnLote } from "@/server/services/pagos";
import { crearDevolucion } from "@/server/services/devoluciones";
import { ErrorDominio } from "@/lib/errores";
import type { DatosVenta } from "@/lib/schemas/venta";
import type { DatosPago, MetodoPago } from "@/lib/schemas/pago";
import type { DatosDevolucion } from "@/lib/schemas/devolucion";

const ADMIN = { id: 1, rol: "admin" as const };

function datosPago(p: {
  idCliente: number;
  fecha: string;
  monto: string;
  metodoPago?: MetodoPago;
  referencia?: string;
  notas?: string;
}): DatosPago {
  return { metodoPago: undefined, referencia: undefined, notas: undefined, ...p };
}

async function crearClienteYUsuarios() {
  const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Idempotencia" } });
  const base = { passwordHash: "x", activo: true, intentosFallidos: 0, creadoEn: new Date() };
  await prisma.usuario.createMany({
    data: [
      { id: 1, username: "admin_t", nombreCompleto: "Admin Test", rol: "admin", ...base },
      { id: 2, username: "operador_t", nombreCompleto: "Operador Test", rol: "operador", ...base },
    ],
  });
  return cliente;
}

async function crearArticuloCatalogo(stock: number) {
  return prisma.catalogo.create({
    data: { nombre: "Anillo Oro 14k", precio: "1500.00", stock },
  });
}

describe("P11 — Idempotencia y protección contra doble clic (< 1 ms)", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  afterAll(async () => {
    await limpiarBaseDePrueba();
  });

  it("crearVenta concurrente con el mismo token (< 1 ms): solo una transacción completa y el stock se descuenta una sola vez", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-10-15",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 3, precioUnitario: "1500.00" }],
    };

    const token = "token-venta-concurrente-uuid-123";

    // Simulación de dos peticiones concurrentes idénticas a < 1 ms de diferencia
    const resultados = await Promise.allSettled([
      crearVenta(ADMIN, datos, token),
      crearVenta(ADMIN, datos, token),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r) => r.status === "rejected");

    // Exactamente una tiene éxito y la otra es rechazada
    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);

    // El error debe ser ErrorDominio con el mensaje exacto
    const rechazo = rechazados[0] as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ErrorDominio);
    expect((rechazo.reason as ErrorDominio).message).toBe("Esta operación ya fue procesada.");

    // Se insertó una sola venta en la base de datos
    const ventas = await prisma.venta.findMany({ where: { idCliente: cliente.id } });
    expect(ventas).toHaveLength(1);

    // El stock del catálogo se descontó solo una vez (10 - 3 = 7, no 4)
    const catalogoActualizado = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(catalogoActualizado.stock).toBe(7);

    // Solo un movimiento de stock registrado
    const movimientos = await prisma.movimientoStock.findMany({ where: { idCatalogo: articulo.id } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].delta).toBe(-3);

    // Solo un registro de auditoría de venta
    const auditorias = await prisma.auditoria.findMany({ where: { tablaAfectada: "ventas" } });
    expect(auditorias).toHaveLength(1);

    // El token quedó persistido en la tabla de idempotencia
    const tokenDb = await prisma.idempotenciaToken.findUnique({ where: { token } });
    expect(tokenDb).not.toBeNull();
    expect(tokenDb?.accion).toBe("crearVenta");
  });

  it("crearVenta subsecuente con el mismo token: se rechaza limpiamente sin modificar datos", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    const datos: DatosVenta = {
      idCliente: cliente.id,
      fecha: "2026-10-15",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 2, precioUnitario: "1500.00" }],
    };

    const token = "token-venta-secuencial-uuid-456";

    // Primera llamada exitosa
    await crearVenta(ADMIN, datos, token);

    // Segunda llamada posterior con el mismo token
    await expect(crearVenta(ADMIN, datos, token)).rejects.toThrowError(
      new ErrorDominio("Esta operación ya fue procesada.")
    );

    // Stock permanece en 8 (solo un descuento de 2)
    const catalogo = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(catalogo.stock).toBe(8);

    const ventas = await prisma.venta.findMany({ where: { idCliente: cliente.id } });
    expect(ventas).toHaveLength(1);
  });

  it("crearPago concurrente con el mismo token (< 1 ms): solo un pago se inserta y el segundo es rechazado", async () => {
    const cliente = await crearClienteYUsuarios();

    const datos = datosPago({
      idCliente: cliente.id,
      fecha: "2026-10-15",
      monto: "500.00",
      metodoPago: "Efectivo",
    });

    const token = "token-pago-concurrente-uuid-789";

    const resultados = await Promise.allSettled([
      crearPago(ADMIN, datos, token),
      crearPago(ADMIN, datos, token),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r) => r.status === "rejected");

    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);

    const rechazo = rechazados[0] as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ErrorDominio);
    expect((rechazo.reason as ErrorDominio).message).toBe("Esta operación ya fue procesada.");

    const pagos = await prisma.pago.findMany({ where: { idCliente: cliente.id } });
    expect(pagos).toHaveLength(1);

    const auditorias = await prisma.auditoria.findMany({ where: { tablaAfectada: "pagos" } });
    expect(auditorias).toHaveLength(1);
  });

  it("crearPagosEnLote concurrente con el mismo token (< 1 ms): solo un lote se registra", async () => {
    const cliente = await crearClienteYUsuarios();
    const cliente2 = await prisma.cliente.create({ data: { nombre: "Cliente 2" } });

    const filas: DatosPago[] = [
      datosPago({ idCliente: cliente.id, fecha: "2026-10-15", monto: "300.00", metodoPago: "Efectivo" }),
      datosPago({ idCliente: cliente2.id, fecha: "2026-10-15", monto: "400.00", metodoPago: "Transferencia" }),
    ];

    const token = "token-lote-concurrente-uuid-999";

    const resultados = await Promise.allSettled([
      crearPagosEnLote(ADMIN, filas, token),
      crearPagosEnLote(ADMIN, filas, token),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r) => r.status === "rejected");

    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);

    const rechazo = rechazados[0] as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ErrorDominio);
    expect((rechazo.reason as ErrorDominio).message).toBe("Esta operación ya fue procesada.");

    // Se insertaron solo los 2 pagos del lote único
    const totalPagos = await prisma.pago.count();
    expect(totalPagos).toBe(2);
  });

  it("crearDevolucion concurrente con el mismo token (< 1 ms): solo una devolución se aplica y stock se incrementa una sola vez", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(10);

    // Venta previa de 5 piezas (stock pasa a 5)
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-10-14",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 5, precioUnitario: "1500.00" }],
    });

    const datosDevolucion: DatosDevolucion = {
      idCliente: cliente.id,
      fecha: "2026-10-15",
      motivo: "Piezas no deseadas",
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 2, precioUnitario: "1500.00" }],
    };

    const token = "token-devolucion-concurrente-uuid-111";

    const resultados = await Promise.allSettled([
      crearDevolucion(ADMIN, datosDevolucion, token),
      crearDevolucion(ADMIN, datosDevolucion, token),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r) => r.status === "rejected");

    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);

    const rechazo = rechazados[0] as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ErrorDominio);
    expect((rechazo.reason as ErrorDominio).message).toBe("Esta operación ya fue procesada.");

    // Solo una devolución registrada
    const devoluciones = await prisma.devolucion.findMany({ where: { idCliente: cliente.id } });
    expect(devoluciones).toHaveLength(1);

    // Stock: 10 inicial - 5 venta + 2 devueltas = 7 (NO 9)
    const catalogo = await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(catalogo.stock).toBe(7);

    // Un movimiento por la venta (-5) y uno solo por la devolución (+2)
    const movimientos = await prisma.movimientoStock.findMany({ where: { idCatalogo: articulo.id } });
    expect(movimientos).toHaveLength(2);
    expect(movimientos.map((m) => m.delta).sort()).toEqual([-5, 2]);
  });

  it("mutaciones sin token continúan funcionando con compatibilidad regresiva", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await crearArticuloCatalogo(5);

    const { id: ventaId } = await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-10-15",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "1500.00" }],
    });

    expect(ventaId).toBeGreaterThan(0);

    const { id: pagoId } = await crearPago(
      ADMIN,
      datosPago({
        idCliente: cliente.id,
        fecha: "2026-10-15",
        monto: "1500.00",
        metodoPago: "Efectivo",
      })
    );

    expect(pagoId).toBeGreaterThan(0);
  });
});
