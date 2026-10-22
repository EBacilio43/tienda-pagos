import { describe, it, expect, beforeEach } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { cargarCuentaDeLibreta, CONCEPTO_SALDO_INICIAL } from "@/server/services/libretas";
import { obtenerSaldo } from "@/server/services/saldo";
import { esquemaCuentaLibreta, type CuentaLibreta } from "@/lib/schemas/libreta";
import { ErrorPermiso } from "@/lib/permisos";

const ADMIN = { id: 1, rol: "admin" as const };
const CONSULTA = { id: 3, rol: "consulta" as const };

async function sembrarUsuarios() {
  const base = { passwordHash: "x", activo: true, intentosFallidos: 0, creadoEn: new Date() };
  await prisma.usuario.createMany({
    data: [
      { id: 1, username: "admin", rol: "admin", nombreCompleto: "Admin", ...base },
      { id: 3, username: "consulta", rol: "consulta", nombreCompleto: "Consulta", ...base },
    ],
  });
}

/** Cuenta mínima válida, ya pasada por el esquema (que aplica los defaults). */
function cuenta(over: Record<string, unknown> = {}) {
  return esquemaCuentaLibreta.parse({
    cliente: { id: null, nombre: "Cliente Libreta" },
    ventas: [
      {
        fecha: "2024-01-15",
        montoTotal: "10000.00",
        tieneEnganche: true,
        enganche: "1000.00",
        articulos: [{ nombre: "Cadena de oro", cantidad: 1, precioUnitario: "10000.00" }],
      },
    ],
    pagos: [
      { fecha: "2024-03-01", monto: "2000.00", metodoPago: "Efectivo" },
      { fecha: "2024-05-01", monto: "1500.00", metodoPago: "Transferencia" },
    ],
    devoluciones: [],
    ...over,
  });
}

describe("cargarCuentaDeLibreta", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
    await sembrarUsuarios();
  });

  it("crea la cuenta completa y el saldo sale por la fórmula de la regla 3", async () => {
    const r = await cargarCuentaDeLibreta(ADMIN, cuenta());

    expect(r.clienteCreado).toBe(true);
    expect(r.ventas).toBe(1);
    expect(r.articulosVenta).toBe(1);
    expect(r.pagos).toBe(2);

    // 10000 vendido − (1000 enganche + 3500 abonos) = 5500
    const saldo = await obtenerSaldo(r.clienteId);
    expect(saldo.toFixed(2)).toBe("5500.00");
  });

  it("escribe una fila de auditoría por registro, con su registro_id real (regla 5)", async () => {
    await cargarCuentaDeLibreta(ADMIN, cuenta());

    const filas = await prisma.auditoria.findMany({
      where: { usuarioId: ADMIN.id },
      select: { tablaAfectada: true, registroId: true },
    });

    // 1 cliente + 1 venta + 2 pagos. Los artículos no llevan renglón propio:
    // pertenecen a su venta y se auditan con ella, como en crearVenta.
    expect(filas).toHaveLength(4);
    expect(filas.every((f) => f.registroId !== null && f.registroId !== "")).toBe(true);

    const porTabla = filas.reduce<Record<string, number>>((acc, f) => {
      acc[f.tablaAfectada] = (acc[f.tablaAfectada] ?? 0) + 1;
      return acc;
    }, {});
    expect(porTabla).toEqual({ clientes: 1, ventas: 1, pagos: 2 });
  });

  it("cada abono queda emparejado con SU renglón de auditoría, no con el de otro", async () => {
    // Los abonos se escriben en lote (`createManyAndReturn`) para no pagar un
    // viaje por cada uno. El riesgo de eso es el emparejamiento: si la
    // auditoría se armara zipeando por índice y el orden devuelto no fuera el
    // de entrada, cada renglón acabaría atribuyéndole a un abono el monto de
    // otro — y nadie lo notaría hasta auditar un cobro.
    const montos = ["111.00", "222.00", "333.00", "444.00", "555.00"];
    const r = await cargarCuentaDeLibreta(
      ADMIN,
      cuenta({
        pagos: montos.map((monto, i) => ({
          fecha: `2024-0${i + 1}-15`,
          monto,
          metodoPago: "Efectivo" as const,
        })),
      })
    );

    const pagos = await prisma.pago.findMany({ where: { idCliente: r.clienteId } });
    const filas = await prisma.auditoria.findMany({ where: { tablaAfectada: "pagos" } });
    expect(filas).toHaveLength(montos.length);

    for (const pago of pagos) {
      const suFila = filas.find((f) => f.registroId === String(pago.id));
      expect(suFila, `el pago ${pago.id} no tiene renglón de auditoría`).toBeDefined();
      expect(suFila!.datosNuevos).toMatchObject({
        monto: pago.monto.toFixed(2),
        fecha: pago.fecha.toISOString().slice(0, 10),
      });
    }
  });

  it("agrega los movimientos a un cliente existente cuando viene id, sin crear otro", async () => {
    const previo = await prisma.cliente.create({ data: { nombre: "Ya Existía" } });

    const r = await cargarCuentaDeLibreta(
      ADMIN,
      cuenta({ cliente: { id: previo.id, nombre: "Ya Existía" } })
    );

    expect(r.clienteCreado).toBe(false);
    expect(r.clienteId).toBe(previo.id);
    expect(await prisma.cliente.count()).toBe(1);
  });

  it("es todo o nada: si un renglón truena, se deshace lo ya escrito", async () => {
    // Se construye SIN pasar por el esquema a propósito. zod y las columnas
    // quedaron alineados —ese fue el arreglo que destapó esta misma prueba—
    // así que un valor que la base rechace ya no puede venir de un JSON
    // válido. Lo que se prueba aquí es el servicio, no el esquema: que la
    // transacción deshaga lo ya escrito cuando algo falla a media cuenta.
    //
    // El fallo va en la SEGUNDA venta a propósito: para entonces el cliente
    // y la primera venta ya están escritos, así que si el rollback no
    // funcionara quedarían huérfanos y el conteo lo delataría.
    const rota = {
      ...cuenta(),
      ventas: [
        {
          fecha: "2024-01-15",
          montoTotal: "10000.00",
          tieneEnganche: false,
          enganche: "0.00",
          articulos: [],
        },
        {
          fecha: "2024-02-15",
          montoTotal: "10000.00",
          tieneEnganche: true,
          // Excede Decimal(12,2) — revienta en el INSERT, no antes.
          enganche: "99999999999999.00",
          articulos: [],
        },
      ],
    } as CuentaLibreta;

    await expect(cargarCuentaDeLibreta(ADMIN, rota)).rejects.toThrow();

    expect(await prisma.cliente.count()).toBe(0);
    expect(await prisma.venta.count()).toBe(0);
    expect(await prisma.pago.count()).toBe(0);
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it("un rol sin permiso no carga nada (regla 7: el gate vive en el servicio)", async () => {
    await expect(cargarCuentaDeLibreta(CONSULTA, cuenta())).rejects.toThrow(ErrorPermiso);
    expect(await prisma.cliente.count()).toBe(0);
  });

  it("los artículos quedan sin vínculo al catálogo y no generan movimientos de stock (regla 4)", async () => {
    const r = await cargarCuentaDeLibreta(ADMIN, cuenta());

    const articulos = await prisma.ventaArticulo.findMany({
      where: { venta: { idCliente: r.clienteId } },
      select: { idCatalogo: true },
    });
    expect(articulos).toHaveLength(1);
    expect(articulos[0].idCatalogo).toBeNull();

    // La invariante de la regla 4 no se toca porque no hay nada que ajustar.
    expect(await prisma.movimientoStock.count()).toBe(0);
  });

  it("carga el saldo inicial como una venta de apertura y el saldo lo incluye", async () => {
    const r = await cargarCuentaDeLibreta(ADMIN, cuenta({ saldoInicial: "4000.00" }));

    expect(r.ventaDeApertura).toBe(true);
    expect(r.ventas).toBe(1); // el conteo es de las ventas del archivo, no de la sintética

    // 4000 heredado + 10000 vendido − (1000 enganche + 3500 abonos) = 9500
    expect((await obtenerSaldo(r.clienteId)).toFixed(2)).toBe("9500.00");

    const ventas = await prisma.venta.findMany({
      where: { idCliente: r.clienteId },
      orderBy: { fecha: "asc" },
      include: { ventaArticulos: true },
    });
    expect(ventas).toHaveLength(2);

    // La fecha es la del movimiento más antiguo de la cuenta (la venta del
    // 2024-01-15), no la de hoy: un abono nunca queda antes de su deuda.
    const apertura = ventas[0];
    expect(apertura.fecha.toISOString().slice(0, 10)).toBe("2024-01-15");
    expect(apertura.montoTotal?.toFixed(2)).toBe("4000.00");
    expect(apertura.enganche?.toFixed(2)).toBe("0.00");
    expect(apertura.ventaArticulos).toHaveLength(1);
    expect(apertura.ventaArticulos[0].nombre).toBe(CONCEPTO_SALDO_INICIAL);
    expect(apertura.ventaArticulos[0].idCatalogo).toBeNull();
  });

  it("un saldo inicial en cero no inventa una venta de apertura", async () => {
    const r = await cargarCuentaDeLibreta(ADMIN, cuenta({ saldoInicial: "0.00" }));

    expect(r.ventaDeApertura).toBe(false);
    expect(await prisma.venta.count({ where: { idCliente: r.clienteId } })).toBe(1);
    expect((await obtenerSaldo(r.clienteId)).toFixed(2)).toBe("5500.00");
  });

  it("un saldo inicial sin ningún movimiento que lo feche no se carga a medias", async () => {
    // Sin movimientos no hay fecha de apertura posible, y adivinarla sería
    // fechar deuda real en un día inventado. Debe reventar ANTES de escribir.
    await expect(
      cargarCuentaDeLibreta(
        ADMIN,
        cuenta({ saldoInicial: "4000.00", ventas: [], pagos: [], devoluciones: [] })
      )
    ).rejects.toThrow(/no tiene ningún movimiento/);
    expect(await prisma.cliente.count()).toBe(0);
  });

  it("la venta de apertura también cuenta contra el tope de escrituras", async () => {
    const muchos = Array.from({ length: 199 }, () => ({
      fecha: "2024-03-01",
      monto: "100.00",
      metodoPago: "Efectivo" as const,
    }));

    // 199 pagos + 1 venta + 1 artículo = 201 ya se pasa; con la de apertura
    // son 203. Lo que se verifica es que la sintética no viaje sin contarse.
    await expect(
      cargarCuentaDeLibreta(ADMIN, cuenta({ pagos: muchos, saldoInicial: "500.00" }))
    ).rejects.toThrow(/203 registros/);
    expect(await prisma.cliente.count()).toBe(0);
  });

  it("rechaza una cuenta más grande que el tope de escrituras por transacción", async () => {
    const muchos = Array.from({ length: 201 }, () => ({
      fecha: "2024-03-01",
      monto: "100.00",
      metodoPago: "Efectivo" as const,
    }));

    await expect(cargarCuentaDeLibreta(ADMIN, cuenta({ pagos: muchos }))).rejects.toThrow(
      /máximo por carga/
    );
    expect(await prisma.cliente.count()).toBe(0);
  });
});

describe("esquemaCuentaLibreta", () => {
  it("rechaza dinero como número — regla 1, nunca sale de un float", () => {
    const r = esquemaCuentaLibreta.safeParse({
      cliente: { nombre: "X" },
      pagos: [{ fecha: "2024-01-01", monto: 2000 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un método de pago fuera del conjunto cerrado", () => {
    const r = esquemaCuentaLibreta.safeParse({
      cliente: { nombre: "X" },
      pagos: [{ fecha: "2024-01-01", monto: "100.00", metodoPago: "efectivo" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una fecha que no sea AAAA-MM-DD — regla 2", () => {
    const r = esquemaCuentaLibreta.safeParse({
      cliente: { nombre: "X" },
      pagos: [{ fecha: "01/03/2024", monto: "100.00" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una fecha con forma válida pero que no existe en el calendario", () => {
    // "2024-13-45" pasa el regex de forma. Sin el refine llegaba al servicio,
    // que lo convertía en Invalid Date y reventaba en el INSERT — a media
    // transacción. Un OCR que lea mal un mes produce exactamente esto.
    const r = esquemaCuentaLibreta.safeParse({
      cliente: { nombre: "X" },
      pagos: [{ fecha: "2024-13-45", monto: "100.00" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un enganche más largo de lo que aguanta Decimal(12,2)", () => {
    // El tope de dígitos faltaba en MONTO_O_CERO: pasaba la validación y
    // fallaba en la base, que es el peor lugar para enterarse.
    const r = esquemaCuentaLibreta.safeParse({
      cliente: { nombre: "X" },
      ventas: [
        {
          fecha: "2024-01-01",
          montoTotal: "5000.00",
          tieneEnganche: true,
          enganche: "99999999999999.00",
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("acepta una venta sin artículos desglosados, que es lo normal en una libreta", () => {
    const r = esquemaCuentaLibreta.safeParse({
      cliente: { nombre: "X" },
      ventas: [{ fecha: "2024-01-01", montoTotal: "5000.00" }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ventas[0].articulos).toEqual([]);
  });
});
