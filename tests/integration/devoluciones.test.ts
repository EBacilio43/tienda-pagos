import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { crearVenta } from "@/server/services/ventas";
import {
  crearDevolucion,
  actualizarDevolucion,
  obtenerArticulosDevolubles,
  obtenerDevolucionDetalle,
} from "@/server/services/devoluciones";
import { obtenerSaldo } from "@/server/services/saldo";
import { sumarMontos } from "@/lib/money";
import { ErrorPermiso } from "@/lib/permisos";
import type { DatosDevolucion } from "@/lib/schemas/devolucion";

const ADMIN = { id: 1, rol: "admin" as const };
const CONSULTA = { id: 3, rol: "consulta" as const };

async function crearClienteYUsuarios() {
  const cliente = await prisma.cliente.create({ data: { nombre: "Cliente Devoluciones" } });
  const base = { passwordHash: "x", activo: true, intentosFallidos: 0, creadoEn: new Date() };
  await prisma.usuario.createMany({
    data: [
      { id: 1, username: "admin_t", nombreCompleto: "Admin Test", rol: "admin", ...base },
      { id: 3, username: "consulta_t", nombreCompleto: "Consulta Test", rol: "consulta", ...base },
    ],
  });
  return cliente;
}

describe("devoluciones — (artículos sin catálogo)", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("un artículo libre vendido aparece como devoluble por nombre+precio", async () => {
    const cliente = await crearClienteYUsuarios();
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: null, nombre: "Anillo único", cantidad: 2, precioUnitario: "1500.00" }],
    });

    const devolubles = await obtenerArticulosDevolubles(cliente.id);
    expect(devolubles).toHaveLength(1);
    expect(devolubles[0]).toMatchObject({
      idCatalogo: null,
      nombre: "Anillo único",
      cantidadDisponible: 2,
    });
    expect(devolubles[0].clave).toMatch(/^libre:/);
  });

  it("se puede registrar la devolución de un artículo libre y no mueve stock", async () => {
    const cliente = await crearClienteYUsuarios();
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: null, nombre: "Anillo único", cantidad: 2, precioUnitario: "1500.00" }],
    });

    const datos: DatosDevolucion = {
      idCliente: cliente.id,
      fecha: "2026-01-05",
      motivo: undefined,
      articulos: [{ idCatalogo: null, nombre: "Anillo único", cantidad: 1, precioUnitario: "1500.00" }],
    };
    const { id: devolucionId } = await crearDevolucion(ADMIN, datos);

    const devolucion = await prisma.devolucion.findUniqueOrThrow({ where: { id: devolucionId } });
    expect(devolucion.montoCredito.toFixed(2)).toBe("1500.00");
    expect(await prisma.movimientoStock.count()).toBe(0);

    // Disponibilidad baja de 2 a 1 tras devolver 1.
    const devolublesRestantes = await obtenerArticulosDevolubles(cliente.id);
    expect(devolublesRestantes[0].cantidadDisponible).toBe(1);
  });

  it("no deja devolver más de lo vendido de un artículo libre", async () => {
    const cliente = await crearClienteYUsuarios();
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: null, nombre: "Anillo único", cantidad: 1, precioUnitario: "1500.00" }],
    });

    const datos: DatosDevolucion = {
      idCliente: cliente.id,
      fecha: "2026-01-05",
      motivo: undefined,
      articulos: [{ idCatalogo: null, nombre: "Anillo único", cantidad: 2, precioUnitario: "1500.00" }],
    };

    await expect(crearDevolucion(ADMIN, datos)).rejects.toThrow(/no se puede devolver/i);
    expect(await prisma.devolucion.count()).toBe(0);
  });

  it("dos artículos libres con el mismo nombre pero precio distinto NO se confunden", async () => {
    const cliente = await crearClienteYUsuarios();
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: null, nombre: "Aretes", cantidad: 1, precioUnitario: "1000.00" }],
    });

    // Vendió 1 a $1000 — intentar devolver 1 a $2000 (mismo nombre, precio
    // distinto) debe fallar: no es el mismo artículo por `claveArticulo`.
    const datos: DatosDevolucion = {
      idCliente: cliente.id,
      fecha: "2026-01-05",
      motivo: undefined,
      articulos: [{ idCatalogo: null, nombre: "Aretes", cantidad: 1, precioUnitario: "2000.00" }],
    };
    await expect(crearDevolucion(ADMIN, datos)).rejects.toThrow(/no se puede devolver/i);
  });
});

describe("crearDevolucion — artículo de catálogo (comportamiento previo, sin regresión)", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("repone el stock al devolver un artículo de catálogo", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await prisma.catalogo.create({ data: { nombre: "Collar", precio: "800.00", stock: 5 } });

    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 3, precioUnitario: "800.00" }],
    });
    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(2);

    await crearDevolucion(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-05",
      motivo: undefined,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "800.00" }],
    });

    expect((await prisma.catalogo.findUniqueOrThrow({ where: { id: articulo.id } })).stock).toBe(3);
  });

  it("un rol sin permiso no puede registrar una devolución", async () => {
    const cliente = await crearClienteYUsuarios();
    const articulo = await prisma.catalogo.create({ data: { nombre: "Collar", precio: "800.00", stock: 5 } });
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "800.00" }],
    });

    await expect(
      crearDevolucion(CONSULTA, {
        idCliente: cliente.id,
        fecha: "2026-01-05",
        motivo: undefined,
        articulos: [{ idCatalogo: articulo.id, nombre: articulo.nombre, cantidad: 1, precioUnitario: "800.00" }],
      })
    ).rejects.toThrow(ErrorPermiso);
  });
});

// La pieza vuelve con desgaste de uso y se le reconoce menos de lo que
// costó: `precio_credito` (migración 20260905180000) guarda ese monto SIN
// tocar `precio_unitario`, que sigue siendo el precio de venta. Esa
// separación no es estilo — es lo que sostiene el emparejamiento contra la
// venta, y la segunda prueba de aquí abajo es la que lo fija.
describe("devoluciones acreditadas por debajo del precio de venta", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  async function clienteConAnilloVendido() {
    const cliente = await crearClienteYUsuarios();
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [{ idCatalogo: null, nombre: "Anillo único", cantidad: 1, precioUnitario: "3000.00" }],
    });
    return cliente;
  }

  const devolucionCon = (idCliente: number, precioCredito: string | null): DatosDevolucion => ({
    idCliente,
    fecha: "2026-01-05",
    motivo: "Desgaste de uso",
    articulos: [
      { idCatalogo: null, nombre: "Anillo único", cantidad: 1, precioUnitario: "3000.00", precioCredito },
    ],
  });

  it("el crédito y el saldo salen del monto acreditado, no del precio de venta", async () => {
    const cliente = await clienteConAnilloVendido();
    const { id } = await crearDevolucion(ADMIN, devolucionCon(cliente.id, "2500.00"));

    const devolucion = await prisma.devolucion.findUniqueOrThrow({ where: { id } });
    expect(devolucion.montoCredito.toFixed(2)).toBe("2500.00");

    // Regla 3: el saldo lo calcula v_saldos_cliente por su lado. 3000 de
    // venta menos 2500 de crédito = 500, no 0.
    expect((await obtenerSaldo(cliente.id)).toFixed(2)).toBe("500.00");

    // El precio de VENTA sigue guardado tal cual: es lo que empareja la
    // pieza devuelta con la vendida.
    const articulo = await prisma.devolucionArticulo.findFirstOrThrow({ where: { idDevolucion: id } });
    expect(articulo.precioUnitario?.toFixed(2)).toBe("3000.00");
    expect(articulo.precioCredito?.toFixed(2)).toBe("2500.00");
  });

  it("la pieza acreditada de menos NO vuelve a quedar disponible para devolver", async () => {
    const cliente = await clienteConAnilloVendido();
    await crearDevolucion(ADMIN, devolucionCon(cliente.id, "2500.00"));

    // El modo de falla que esta prueba existe para impedir: si el descuento
    // se escribiera encima de `precio_unitario`, la clave de la pieza
    // devuelta ("libre:anillo único::2500.00") no coincidiría con la de la
    // vendida ("...::3000.00"), la resta no encontraría a quién restarle, y
    // la misma pieza quedaría disponible para devolverse otra vez — en
    // silencio, porque nada revienta.
    expect(await obtenerArticulosDevolubles(cliente.id)).toHaveLength(0);
    await expect(crearDevolucion(ADMIN, devolucionCon(cliente.id, "2500.00"))).rejects.toThrow(
      /no se puede devolver/i
    );
  });

  it("no deja acreditar más de lo que la pieza costó, y no escribe nada", async () => {
    const cliente = await clienteConAnilloVendido();

    await expect(crearDevolucion(ADMIN, devolucionCon(cliente.id, "25000.00"))).rejects.toThrow(
      /no se puede acreditar más/i
    );
    expect(await prisma.devolucion.count()).toBe(0);
  });

  it("la base rechaza el sobrecrédito aunque se escriba sin pasar por el servicio", async () => {
    // Segunda red independiente (): el CHECK de la migración, que
    // no depende de que toda escritura pase por el código correcto.
    const cliente = await clienteConAnilloVendido();
    await expect(
      prisma.devolucion.create({
        data: {
          idCliente: cliente.id,
          fecha: new Date("2026-01-05T00:00:00Z"),
          montoCredito: "25000.00",
          devolucionArticulos: {
            create: [
              { nombre: "Anillo único", cantidad: 1, precioUnitario: "3000.00", precioCredito: "25000.00" },
            ],
          },
        },
      })
    ).rejects.toThrow(/devolucion_articulos_precio_credito_valido/);
  });

  it("editar el monto acreditado recalcula el crédito y el saldo", async () => {
    const cliente = await clienteConAnilloVendido();
    const { id } = await crearDevolucion(ADMIN, devolucionCon(cliente.id, "2500.00"));

    await actualizarDevolucion(ADMIN, id, devolucionCon(cliente.id, "1800.00"));

    const devolucion = await prisma.devolucion.findUniqueOrThrow({ where: { id } });
    expect(devolucion.montoCredito.toFixed(2)).toBe("1800.00");
    expect((await obtenerSaldo(cliente.id)).toFixed(2)).toBe("1200.00");
  });

  it("sin monto acreditado se sigue acreditando el precio de venta", async () => {
    const cliente = await clienteConAnilloVendido();
    const { id } = await crearDevolucion(ADMIN, devolucionCon(cliente.id, null));

    const devolucion = await prisma.devolucion.findUniqueOrThrow({ where: { id } });
    expect(devolucion.montoCredito.toFixed(2)).toBe("3000.00");
    // null = "sin excepción". Que la columna quede vacía es lo que permite
    // distinguir después una devolución ajustada de una normal.
    const articulo = await prisma.devolucionArticulo.findFirstOrThrow({ where: { idDevolucion: id } });
    expect(articulo.precioCredito).toBeNull();
    expect((await obtenerSaldo(cliente.id)).toFixed(2)).toBe("0.00");
  });

  it("el desglose que se muestra suma exactamente el crédito de la devolución", async () => {
    const cliente = await crearClienteYUsuarios();
    await crearVenta(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-01",
      esquemaPago: "Contado",
      tieneEnganche: false,
      articulos: [
        { idCatalogo: null, nombre: "Anillo único", cantidad: 2, precioUnitario: "3000.00" },
        { idCatalogo: null, nombre: "Collar", cantidad: 1, precioUnitario: "1200.00" },
      ],
    });

    // Dos piezas devueltas, solo una con desgaste: por eso el ajuste es por
    // pieza y no un total de la devolución.
    const { id } = await crearDevolucion(ADMIN, {
      idCliente: cliente.id,
      fecha: "2026-01-05",
      motivo: undefined,
      articulos: [
        {
          idCatalogo: null,
          nombre: "Anillo único",
          cantidad: 2,
          precioUnitario: "3000.00",
          precioCredito: "2500.00",
        },
        { idCatalogo: null, nombre: "Collar", cantidad: 1, precioUnitario: "1200.00" },
      ],
    });

    const detalle = await obtenerDevolucionDetalle(id);
    expect(detalle).not.toBeNull();
    expect(detalle?.montoCredito).toBe("6200.00");
    expect(sumarMontos(...(detalle?.articulos ?? []).map((a) => a.subtotal))).toBe("6200.00");
  });
});

// Ver la nota en saldo.test.ts.
afterAll(async () => {
  await limpiarBaseDePrueba();
});
