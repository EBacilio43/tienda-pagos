import { describe, it, expect, beforeEach } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { eliminarCuentaCompleta } from "@/server/services/clientes";
import { cargarCuentaDeLibreta } from "@/server/services/libretas";
import { esquemaCuentaLibreta } from "@/lib/schemas/libreta";
import { ErrorPermiso } from "@/lib/permisos";

const ADMIN = { id: 1, rol: "admin" as const };
const OPERADOR = { id: 2, rol: "operador" as const };

async function sembrarUsuarios() {
  const base = { passwordHash: "x", activo: true, intentosFallidos: 0, creadoEn: new Date() };
  await prisma.usuario.createMany({
    data: [
      { id: 1, username: "admin", rol: "admin", nombreCompleto: "Admin", ...base },
      { id: 2, username: "operador", rol: "operador", nombreCompleto: "Operador", ...base },
    ],
  });
}

/** Una cuenta con de todo: ventas con artículos, abonos y una devolución. */
async function sembrarCuenta(nombre = "Cliente Viejo") {
  return cargarCuentaDeLibreta(
    ADMIN,
    esquemaCuentaLibreta.parse({
      cliente: { id: null, nombre },
      ventas: [
        {
          fecha: "2024-01-15",
          montoTotal: "10000.00",
          tieneEnganche: true,
          enganche: "1000.00",
          articulos: [{ nombre: "Cadena de oro", cantidad: 1, precioUnitario: "10000.00" }],
        },
        { fecha: "2024-06-01", montoTotal: "5000.00" },
      ],
      pagos: [
        { fecha: "2024-03-01", monto: "2000.00" },
        { fecha: "2024-05-01", monto: "1500.00" },
      ],
      devoluciones: [{ fecha: "2024-07-01", motivo: "No le quedó", montoCredito: "3000.00" }],
    })
  );
}

describe("eliminarCuentaCompleta", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
    await sembrarUsuarios();
  });

  it("se lleva al cliente y todos sus movimientos", async () => {
    const { clienteId } = await sembrarCuenta();

    const r = await eliminarCuentaCompleta(ADMIN, clienteId);

    expect(r.nombre).toBe("Cliente Viejo");
    expect(r.ventas).toBe(2);
    expect(r.pagos).toBe(2);
    expect(r.devoluciones).toBe(1);
    // 15000 vendido − (1000 enganche + 3500 abonos) − 3000 devuelto = 7500
    expect(r.saldoQueTenia).toBe("7500.00");

    expect(await prisma.cliente.count()).toBe(0);
    expect(await prisma.venta.count()).toBe(0);
    expect(await prisma.pago.count()).toBe(0);
    expect(await prisma.devolucion.count()).toBe(0);
    // Cascade de venta_articulos: si no corriera, quedarían filas huérfanas
    // apuntando a una venta que ya no existe.
    expect(await prisma.ventaArticulo.count()).toBe(0);
  });

  it("deja un renglón de auditoría por registro borrado, con su id real (regla 5)", async () => {
    const { clienteId } = await sembrarCuenta();
    await prisma.auditoria.deleteMany({}); // solo interesa lo que escribe el borrado

    await eliminarCuentaCompleta(ADMIN, clienteId);

    const filas = await prisma.auditoria.findMany({
      select: { accion: true, tablaAfectada: true, registroId: true, datosAnteriores: true },
    });

    // 2 ventas + 2 pagos + 1 devolución + 1 cliente.
    expect(filas).toHaveLength(6);
    expect(filas.every((f) => f.accion === "eliminar")).toBe(true);
    expect(filas.every((f) => f.registroId !== null && f.registroId !== "")).toBe(true);

    const porTabla = filas.reduce<Record<string, number>>((acc, f) => {
      acc[f.tablaAfectada] = (acc[f.tablaAfectada] ?? 0) + 1;
      return acc;
    }, {});
    expect(porTabla).toEqual({ ventas: 2, pagos: 2, devoluciones: 1, clientes: 1 });

    // El saldo que la cuenta tenía es lo único que queda de ella: si no se
    // guarda aquí, después no hay forma de saber cuánto se borró.
    const delCliente = filas.find((f) => f.tablaAfectada === "clientes");
    expect(delCliente?.datosAnteriores).toMatchObject({
      nombre: "Cliente Viejo",
      saldoQueTenia: "7500.00",
      origen: "borrado_cuenta_completa",
    });
  });

  it("es todo o nada: un cliente que no existe no borra nada de los demás", async () => {
    const { clienteId } = await sembrarCuenta();

    await expect(eliminarCuentaCompleta(ADMIN, clienteId + 999)).rejects.toThrow(
      /No existe un cliente/
    );

    expect(await prisma.cliente.count()).toBe(1);
    expect(await prisma.pago.count()).toBe(2);
  });

  it("solo admin puede borrar una cuenta completa, y el gate vive en el servicio", async () => {
    const { clienteId } = await sembrarCuenta();

    // Operador sí puede capturar ventas y abonos; borrar clientes es de admin
    // (ADR-09). Si el gate viviera en la Server Action, este script lo saltaría.
    await expect(eliminarCuentaCompleta(OPERADOR, clienteId)).rejects.toThrow(ErrorPermiso);
    expect(await prisma.cliente.count()).toBe(1);
  });

  it("libera el nombre para que la cuenta transcrita pueda entrar (clientes.nombre es UNIQUE)", async () => {
    // Es literalmente el motivo por el que existe el servicio: la carga de la
    // libreta falla con el nombre ocupado, así que el borrado tiene que ir
    // antes y dejarlo libre de verdad.
    const vieja = await sembrarCuenta("Cliente Prueba");
    await eliminarCuentaCompleta(ADMIN, vieja.clienteId);

    const nueva = await cargarCuentaDeLibreta(
      ADMIN,
      esquemaCuentaLibreta.parse({
        cliente: { id: null, nombre: "Cliente Prueba" },
        ventas: [{ fecha: "2025-02-02", montoTotal: "8000.00" }],
        pagos: [{ fecha: "2025-03-02", monto: "1000.00" }],
      })
    );

    expect(nueva.clienteCreado).toBe(true);
    expect(nueva.clienteId).not.toBe(vieja.clienteId);
    expect(await prisma.cliente.count()).toBe(1);
  });
});
