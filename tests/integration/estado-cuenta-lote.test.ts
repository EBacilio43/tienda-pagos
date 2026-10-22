import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import {
  obtenerDatosEstadoCuenta,
  obtenerLedgerCliente,
} from "@/server/services/estado-cuenta";
import { obtenerResumenSaldo } from "@/server/services/saldo";

// obtenerDatosEstadoCuenta (el camino del PDF) dejó de ser un bucle
// por-cliente y pasó a consultas en lote: de 11 consultas por cliente —550
// en el tope de 50— a 11 constantes. Lo que esta suite fija es que el lote
// y el camino por-cliente (obtenerLedgerCliente/obtenerResumenSaldo, que
// siguen existiendo porque los usa /clientes/[id]) den EXACTAMENTE lo
// mismo: son dos implementaciones distintas del mismo dato, y la regla 3
// exige que no puedan divergir. Sin esto, un cambio futuro a una sola de
// las dos haría que el PDF y la pantalla mostraran números distintos.
describe("estado de cuenta en lote (PDF) vs. camino por cliente", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  async function clienteConHistorial(nombre: string) {
    const cliente = await prisma.cliente.create({ data: { nombre } });
    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-01T00:00:00Z"),
        montoTotal: "1000.00",
        esquemaPago: "Pagos",
        tieneEnganche: true,
        enganche: "100.00",
        ventaArticulos: { create: [{ nombre: "Anillo", cantidad: 2, precioUnitario: "500.00" }] },
      },
    });
    await prisma.pago.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-05T00:00:00Z"),
        monto: "200.00",
        metodoPago: "Efectivo",
      },
    });
    await prisma.devolucion.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-10T00:00:00Z"),
        montoCredito: "50.00",
        motivo: "Defecto",
        devolucionArticulos: { create: [{ nombre: "Anillo", cantidad: 1, precioUnitario: "50.00" }] },
      },
    });
    return cliente;
  }

  it("da el mismo ledger y el mismo resumen que pedirlos cliente por cliente", async () => {
    const a = await clienteConHistorial("Cliente Lote Uno");
    const b = await clienteConHistorial("Cliente Lote Dos");
    // Un cliente sin un solo movimiento: el LEFT JOIN de la vista y los
    // groupBy en lote lo omiten, y aun así tiene que aparecer con ceros.
    const c = await prisma.cliente.create({ data: { nombre: "Cliente Lote Vacio" } });

    const enLote = await obtenerDatosEstadoCuenta([a.id, b.id, c.id]);
    expect(enLote).toHaveLength(3);

    for (const dato of enLote) {
      expect(dato.movimientos).toEqual(await obtenerLedgerCliente(dato.id));
      expect(dato.resumen).toEqual(await obtenerResumenSaldo(dato.id));
    }

    const vacio = enLote.find((d) => d.id === c.id);
    expect(vacio?.movimientos).toEqual([]);
    expect(vacio?.resumen.saldo).toBe("0.00");
    expect(vacio?.resumen.totalVentas).toBe("0.00");
  });

  it("respeta el orden en que se pidieron los clientes", async () => {
    const a = await clienteConHistorial("Cliente Orden A");
    const b = await clienteConHistorial("Cliente Orden B");

    // findMany no garantiza orden, así que el lote tiene que reordenar a
    // propósito: el PDF arma una página por cliente en el orden pedido.
    expect((await obtenerDatosEstadoCuenta([b.id, a.id])).map((d) => d.id)).toEqual([b.id, a.id]);
    expect((await obtenerDatosEstadoCuenta([a.id, b.id])).map((d) => d.id)).toEqual([a.id, b.id]);
  });

  it("salta ids inexistentes sin romper, y devuelve [] con lista vacía", async () => {
    const a = await clienteConHistorial("Cliente Existente");

    expect(await obtenerDatosEstadoCuenta([])).toEqual([]);
    expect((await obtenerDatosEstadoCuenta([999999])).length).toBe(0);
    expect((await obtenerDatosEstadoCuenta([a.id, 999999])).map((d) => d.id)).toEqual([a.id]);
  });

  it("no mezcla los movimientos de un cliente con los de otro", async () => {
    const a = await clienteConHistorial("Cliente Aislado A");
    const b = await prisma.cliente.create({ data: { nombre: "Cliente Aislado B" } });
    await prisma.pago.create({
      data: { idCliente: b.id, fecha: new Date("2026-02-01T00:00:00Z"), monto: "999.00" },
    });

    const [datosA, datosB] = await obtenerDatosEstadoCuenta([a.id, b.id]);
    expect(datosA.resumen.totalPagos).toBe("200.00");
    expect(datosB.resumen.totalPagos).toBe("999.00");
    expect(datosB.movimientos).toHaveLength(1);
    expect(datosB.movimientos[0].abono).toBe("999.00");
  });
});


// El ledger dejó de llevar solo los nombres pegados ("2x Anillo, 1x Collar")
// y ahora carga el desglose por pieza con su precio: lo pintan la Vista
// General, las pestañas de venta/devolución y el PDF desde ESTA sola
// construcción. Que salga de un único lugar es lo que impide que la pantalla
// y el documento que se le entrega al cliente digan precios distintos de la
// misma pieza.
describe("desglose por pieza del ledger", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("una venta lleva sus piezas con precio unitario y subtotal", async () => {
    const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Desglose" } });
    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-01T00:00:00Z"),
        montoTotal: "7200.00",
        tieneEnganche: true,
        enganche: "1000.00",
        ventaArticulos: {
          create: [
            { nombre: "Anillo oro", cantidad: 2, precioUnitario: "3000.00" },
            { nombre: "Collar plata", cantidad: 1, precioUnitario: "1200.00" },
          ],
        },
      },
    });

    const ledger = await obtenerLedgerCliente(cliente.id);
    const venta = ledger.find((m) => m.tipo === "venta");
    expect(venta?.articulos).toEqual([
      { nombre: "Anillo oro", cantidad: 2, precioUnitario: "3000.00", subtotal: "6000.00" },
      { nombre: "Collar plata", cantidad: 1, precioUnitario: "1200.00", subtotal: "1200.00" },
    ]);

    // El enganche no es una pieza que se compre: es un abono de la misma
    // venta, y no tiene desglose propio que mostrar.
    expect(ledger.find((m) => m.tipo === "enganche")?.articulos).toEqual([]);
  });

  it("un abono no tiene piezas", async () => {
    const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Solo Abono" } });
    await prisma.pago.create({
      data: { idCliente: cliente.id, fecha: new Date("2026-02-01T00:00:00Z"), monto: "500.00" },
    });

    const ledger = await obtenerLedgerCliente(cliente.id);
    expect(ledger[0].articulos).toEqual([]);
  });

  it("una pieza sin precio se queda sin precio, no en cero", async () => {
    // `precio_unitario` es nullable desde el esquema legacy y hay ventas
    // capturadas de libreta con el total pero sin desglosar precios. Un
    // $0.00 impreso en un estado de cuenta diría que la pieza se regaló.
    const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Sin Precio" } });
    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-01T00:00:00Z"),
        montoTotal: "900.00",
        ventaArticulos: { create: [{ nombre: "Pieza histórica", cantidad: 1 }] },
      },
    });

    const ledger = await obtenerLedgerCliente(cliente.id);
    expect(ledger[0].articulos).toEqual([
      { nombre: "Pieza histórica", cantidad: 1, precioUnitario: null, subtotal: null },
    ]);
  });

  it("una devolución muestra el precio ACREDITADO, no el de venta", async () => {
    // Es el número que suma al abono de esa fila: mostrar el de venta
    // dejaría un desglose que no cuadra con su propio movimiento.
    const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Devolución Ajustada" } });
    await prisma.devolucion.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-03-01T00:00:00Z"),
        montoCredito: "2500.00",
        devolucionArticulos: {
          create: [
            {
              nombre: "Anillo oro",
              cantidad: 1,
              precioUnitario: "3000.00",
              precioCredito: "2500.00",
            },
          ],
        },
      },
    });

    const ledger = await obtenerLedgerCliente(cliente.id);
    expect(ledger[0].abono).toBe("2500.00");
    expect(ledger[0].articulos).toEqual([
      { nombre: "Anillo oro", cantidad: 1, precioUnitario: "2500.00", subtotal: "2500.00" },
    ]);
  });

  it("el camino en lote (el PDF) trae el mismo desglose que el por cliente", async () => {
    // Son dos implementaciones del mismo dato (ver la suite de arriba): si
    // solo una llevara el desglose, la pantalla y el PDF dirían cosas
    // distintas de la misma venta.
    const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Desglose Lote" } });
    await prisma.venta.create({
      data: {
        idCliente: cliente.id,
        fecha: new Date("2026-01-01T00:00:00Z"),
        montoTotal: "1500.00",
        ventaArticulos: { create: [{ nombre: "Dije", cantidad: 3, precioUnitario: "500.00" }] },
      },
    });

    const [enLote] = await obtenerDatosEstadoCuenta([cliente.id]);
    expect(enLote.movimientos.map((m) => m.articulos)).toEqual(
      (await obtenerLedgerCliente(cliente.id)).map((m) => m.articulos)
    );
    expect(enLote.movimientos[0].articulos).toEqual([
      { nombre: "Dije", cantidad: 3, precioUnitario: "500.00", subtotal: "1500.00" },
    ]);
  });
});
afterAll(async () => {
  await limpiarBaseDePrueba();
});
