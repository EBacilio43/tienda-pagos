import { describe, it, expect, beforeEach } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import {
  resumenDeActividadPorDia,
  listarActividadDelDia,
  listarActividadReciente,
} from "@/server/services/actividad";

// El calendario de /actividad agrupa por `fecha` (la columna DATE de
// negocio) y NO por `fecha_registro_sistema` (la hora de inserción), que es
// lo que usa el feed. Al importar movimientos pasados, las fechas de negocio
// difieren de la fecha del sistema en que se insertan. Con el criterio del feed,
// el calendario enseñaría un solo día con todo y el resto en blanco.
describe("resumenDeActividadPorDia", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  async function cliente(nombre = "Cliente Calendario") {
    return prisma.cliente.create({ data: { nombre } });
  }

  function dia(fecha: string, dias: Awaited<ReturnType<typeof resumenDeActividadPorDia>>) {
    return dias.find((d) => d.fecha === fecha);
  }

  it("agrupa por la fecha de negocio, no por la de captura", async () => {
    const c = await cliente();
    // Una venta del 2013 capturada en 2026 — el caso literal de la carga de
    // libretas. Tiene que caer en septiembre de 2013.
    await prisma.venta.create({
      data: {
        idCliente: c.id,
        fecha: new Date("2013-09-01T00:00:00Z"),
        fechaRegistroSistema: new Date("2026-09-05T18:30:00Z"),
        montoTotal: "5000.00",
      },
    });

    const enLaCarga = await resumenDeActividadPorDia("2026-09-01", "2026-09-30");
    expect(dia("2026-09-05", enLaCarga)).toBeUndefined();

    const enElNegocio = await resumenDeActividadPorDia("2013-09-01", "2013-09-30");
    expect(dia("2013-09-01", enElNegocio)?.cargos).toBe("5000.00");
  });

  it("separa cargos de abonos en vez de sumarlos", async () => {
    const c = await cliente();
    await prisma.venta.create({
      data: { idCliente: c.id, fecha: new Date("2026-03-10T00:00:00Z"), montoTotal: "1000.00" },
    });
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-03-10T00:00:00Z"), monto: "400.00" },
    });

    const [d] = await resumenDeActividadPorDia("2026-03-10", "2026-03-10");
    // Sumarlos daría 1400 y restarlos 600; ninguno de los dos es "lo que
    // pasó ese día" (docs/DOMINIO.md: la venta sube la deuda, el abono la baja).
    expect(d.cargos).toBe("1000.00");
    expect(d.abonos).toBe("400.00");
    expect(d.movimientos).toBe(2);
  });

  it("cuenta el enganche como abono y como movimiento aparte de su venta", async () => {
    const c = await cliente();
    await prisma.venta.create({
      data: {
        idCliente: c.id,
        fecha: new Date("2026-04-02T00:00:00Z"),
        montoTotal: "2000.00",
        tieneEnganche: true,
        enganche: "300.00",
      },
    });

    const [d] = await resumenDeActividadPorDia("2026-04-02", "2026-04-02");
    expect(d.cargos).toBe("2000.00");
    expect(d.abonos).toBe("300.00");
    // La venta y su enganche: dos renglones en el feed, dos movimientos aquí.
    expect(d.movimientos).toBe(2);
  });

  it("ignora el enganche cuando tiene_enganche es false", async () => {
    const c = await cliente();
    await prisma.venta.create({
      data: {
        idCliente: c.id,
        fecha: new Date("2026-04-03T00:00:00Z"),
        montoTotal: "2000.00",
        tieneEnganche: false,
        enganche: "300.00",
      },
    });

    const [d] = await resumenDeActividadPorDia("2026-04-03", "2026-04-03");
    expect(d.abonos).toBe("0.00");
    expect(d.movimientos).toBe(1);
  });

  it("suma la devolución del lado de los abonos", async () => {
    const c = await cliente();
    await prisma.devolucion.create({
      data: {
        idCliente: c.id,
        fecha: new Date("2026-05-20T00:00:00Z"),
        montoCredito: "750.00",
      },
    });

    const [d] = await resumenDeActividadPorDia("2026-05-20", "2026-05-20");
    expect(d.cargos).toBe("0.00");
    expect(d.abonos).toBe("750.00");
  });

  it("acumula varios movimientos del mismo día en una sola celda", async () => {
    const c = await cliente();
    for (const monto of ["100.00", "250.50", "49.50"]) {
      await prisma.pago.create({
        data: { idCliente: c.id, fecha: new Date("2026-06-15T00:00:00Z"), monto },
      });
    }

    const [d] = await resumenDeActividadPorDia("2026-06-15", "2026-06-15");
    expect(d.abonos).toBe("400.00");
    expect(d.movimientos).toBe(3);
  });

  // La cuadrícula enseña días del mes vecino en la primera y la última
  // semana. Si el rango fuera el del mes, esas celdas dirían "sin
  // actividad" teniéndola — y el enlace del calendario llevaría a una
  // lista que sí tiene movimientos.
  it("incluye los dos extremos del rango", async () => {
    const c = await cliente();
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-08-31T00:00:00Z"), monto: "10.00" },
    });
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-10-04T00:00:00Z"), monto: "20.00" },
    });

    const dias = await resumenDeActividadPorDia("2026-08-31", "2026-10-04");
    expect(dia("2026-08-31", dias)?.abonos).toBe("10.00");
    expect(dia("2026-10-04", dias)?.abonos).toBe("20.00");
  });

  it("deja fuera lo que cae afuera del rango", async () => {
    const c = await cliente();
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-07-31T00:00:00Z"), monto: "10.00" },
    });

    expect(await resumenDeActividadPorDia("2026-08-01", "2026-08-31")).toEqual([]);
  });

  it("devuelve los días ordenados de más viejo a más nuevo", async () => {
    const c = await cliente();
    for (const fecha of ["2026-02-20", "2026-02-03", "2026-02-11"]) {
      await prisma.pago.create({
        data: { idCliente: c.id, fecha: new Date(`${fecha}T00:00:00Z`), monto: "10.00" },
      });
    }

    const dias = await resumenDeActividadPorDia("2026-02-01", "2026-02-28");
    expect(dias.map((d) => d.fecha)).toEqual(["2026-02-03", "2026-02-11", "2026-02-20"]);
  });

  it("un mes sin movimientos no inventa celdas vacías", async () => {
    await cliente();
    expect(await resumenDeActividadPorDia("2026-01-01", "2026-01-31")).toEqual([]);
  });
});

describe("listarActividadDelDia", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("trae los movimientos de ese día y ninguno del vecino", async () => {
    const c = await prisma.cliente.create({ data: { nombre: "Cliente Día" } });
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-03-09T00:00:00Z"), monto: "1.00" },
    });
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-03-10T00:00:00Z"), monto: "2.00" },
    });
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-03-11T00:00:00Z"), monto: "3.00" },
    });

    const items = await listarActividadDelDia("2026-03-10");
    expect(items).toHaveLength(1);
    expect(items[0].monto).toBe("2.00");
  });

  // Que la lista y la celda cuadren no es cosmético: la celda es lo que
  // invita a hacer clic, y si el conteo no coincide con lo que aparece
  // después, uno de los dos está mintiendo y no hay forma de saber cuál.
  it("da tantos items como movimientos cuenta el resumen del mismo día", async () => {
    const c = await prisma.cliente.create({ data: { nombre: "Cliente Cuadre" } });
    await prisma.venta.create({
      data: {
        idCliente: c.id,
        fecha: new Date("2026-03-12T00:00:00Z"),
        montoTotal: "900.00",
        tieneEnganche: true,
        enganche: "100.00",
      },
    });
    await prisma.pago.create({
      data: { idCliente: c.id, fecha: new Date("2026-03-12T00:00:00Z"), monto: "50.00" },
    });
    await prisma.devolucion.create({
      data: { idCliente: c.id, fecha: new Date("2026-03-12T00:00:00Z"), montoCredito: "25.00" },
    });

    const [resumen] = await resumenDeActividadPorDia("2026-03-12", "2026-03-12");
    const items = await listarActividadDelDia("2026-03-12");

    expect(items).toHaveLength(resumen.movimientos);
    expect(items.map((i) => i.tipo).sort()).toEqual(
      ["devolucion", "enganche", "pago", "venta"].sort()
    );
  });

  it("un día sin movimientos devuelve una lista vacía, no un error", async () => {
    await prisma.cliente.create({ data: { nombre: "Cliente Vacío" } });
    expect(await listarActividadDelDia("2026-03-13")).toEqual([]);
  });
});

// El feed y el calendario comparten `construirItems` desde que se agregó el
// calendario. Esto fija que la extracción no cambió lo que el feed devuelve
// — sobre todo la regla del enganche, que es la que se olvida al copiar.
describe("el feed no cambió al compartir la construcción de items", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("sigue desdoblando la venta con enganche en dos renglones", async () => {
    const c = await prisma.cliente.create({ data: { nombre: "Cliente Feed" } });
    await prisma.venta.create({
      data: {
        idCliente: c.id,
        fecha: new Date("2026-03-14T00:00:00Z"),
        fechaRegistroSistema: new Date("2026-03-14T10:00:00Z"),
        montoTotal: "900.00",
        tieneEnganche: true,
        enganche: "100.00",
      },
    });

    const items = await listarActividadReciente(50);
    expect(items.map((i) => i.tipo)).toEqual(["enganche", "venta"]);
    expect(items.find((i) => i.tipo === "enganche")?.monto).toBe("100.00");
  });

  it("respeta el límite después de mezclar las tres tablas", async () => {
    const c = await prisma.cliente.create({ data: { nombre: "Cliente Límite" } });
    for (let i = 1; i <= 5; i++) {
      await prisma.pago.create({
        data: {
          idCliente: c.id,
          fecha: new Date("2026-03-15T00:00:00Z"),
          fechaRegistroSistema: new Date(`2026-03-15T10:0${i}:00Z`),
          monto: `${i}.00`,
        },
      });
    }

    expect(await listarActividadReciente(3)).toHaveLength(3);
  });
});
