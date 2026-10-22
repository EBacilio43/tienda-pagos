import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { crearPagosEnLote, buscarPagosDuplicados, claveDuplicado } from "@/server/services/pagos";
import { obtenerSaldo } from "@/server/services/saldo";
import { ErrorPermiso } from "@/lib/permisos";
import { METODOS_PAGO, type DatosPago, type MetodoPago } from "@/lib/schemas/pago";

const ADMIN = { id: 1, rol: "admin" as const };
const CONSULTA = { id: 3, rol: "consulta" as const };

// DatosPago es el tipo de SALIDA de Zod: el `.transform()` de los campos
// opcionales deja las claves presentes aunque valgan undefined, así que un
// literal sin ellas no compila. Este helper las rellena para que las
// pruebas se lean por lo que importa (cliente, fecha, monto).
function pago(p: {
  idCliente: number;
  fecha: string;
  monto: string;
  metodoPago?: MetodoPago;
}): DatosPago {
  return { metodoPago: undefined, referencia: undefined, notas: undefined, ...p };
}

async function sembrar() {
  const base = { passwordHash: "x", activo: true, intentosFallidos: 0, creadoEn: new Date() };
  await prisma.usuario.createMany({
    data: [
      { id: 1, username: "admin_t", nombreCompleto: "Admin Test", rol: "admin", ...base },
      { id: 3, username: "consulta_t", nombreCompleto: "Consulta Test", rol: "consulta", ...base },
    ],
  });
  const a = await prisma.cliente.create({ data: { nombre: "Cliente Lote A" } });
  const b = await prisma.cliente.create({ data: { nombre: "Cliente Lote B" } });
  // Una venta a cada uno, para que tengan saldo contra el cual abonar.
  for (const c of [a, b]) {
    await prisma.venta.create({
      data: { idCliente: c.id, fecha: new Date("2026-01-01T00:00:00Z"), montoTotal: "5000.00" },
    });
  }
  return { a, b };
}

describe("crearPagosEnLote", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("registra todos los abonos con una fila de auditoría cada uno (regla 5)", async () => {
    const { a, b } = await sembrar();

    const filas: DatosPago[] = [
      pago({ idCliente: a.id, fecha: "2026-08-08", monto: "1000.00", metodoPago: "Efectivo" }),
      pago({ idCliente: b.id, fecha: "2026-08-08", monto: "500.00" }),
      pago({ idCliente: a.id, fecha: "2026-08-09", monto: "250.00" }),
    ];

    const { ids } = await crearPagosEnLote(ADMIN, filas);
    expect(ids).toHaveLength(3);

    expect(await prisma.pago.count()).toBe(3);

    // Regla 5: una fila por registro afectado, con su registro_id real —
    // no un solo renglón "se capturó un lote".
    const auditoria = await prisma.auditoria.findMany({ where: { tablaAfectada: "pagos" } });
    expect(auditoria).toHaveLength(3);
    expect(auditoria.map((x) => x.registroId).sort()).toEqual(ids.map(String).sort());
    for (const fila of auditoria) {
      expect(fila.registroId).not.toBeNull();
      expect(fila.usuarioId).toBe(ADMIN.id);
    }
  });

  it("el saldo refleja el lote completo (regla 3, la fórmula sigue en la vista)", async () => {
    const { a } = await sembrar();

    await crearPagosEnLote(ADMIN, [
      pago({ idCliente: a.id, fecha: "2026-08-08", monto: "1000.00" }),
      pago({ idCliente: a.id, fecha: "2026-08-09", monto: "1500.00" }),
    ]);

    // 5000 de venta − 2500 abonado
    expect((await obtenerSaldo(a.id)).toFixed(2)).toBe("2500.00");
  });

  it("es todo o nada: un renglón inválido no deja los anteriores guardados", async () => {
    const { a } = await sembrar();

    await expect(
      crearPagosEnLote(ADMIN, [
        pago({ idCliente: a.id, fecha: "2026-08-08", monto: "1000.00" }),
        // Cliente inexistente: la FK revienta a media transacción.
        pago({ idCliente: 999999, fecha: "2026-08-08", monto: "500.00" }),
      ])
    ).rejects.toThrow();

    // El primero NO debe haber quedado: si quedara, el operador no tendría
    // forma de saber qué sí entró y qué no, y recapturar duplicaría.
    expect(await prisma.pago.count()).toBe(0);
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it("un rol sin permiso no registra nada (regla 7: el gate vive en el servicio)", async () => {
    const { a } = await sembrar();

    await expect(
      crearPagosEnLote(CONSULTA, [pago({ idCliente: a.id, fecha: "2026-08-08", monto: "1000.00" })])
    ).rejects.toBeInstanceOf(ErrorPermiso);

    expect(await prisma.pago.count()).toBe(0);
  });

  it("una lista vacía no hace nada y no truena", async () => {
    await sembrar();
    expect((await crearPagosEnLote(ADMIN, [])).ids).toEqual([]);
    expect(await prisma.pago.count()).toBe(0);
  });
});

describe("pagos.metodo_pago — el conjunto cerrado (migración 20260817120000)", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
    await sembrar();
  });

  it("el CHECK de la base rechaza un método fuera del conjunto, aunque el INSERT no pase por la app", async () => {
    const cliente = await prisma.cliente.findFirstOrThrow();

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO pagos (id_cliente, fecha, monto, metodo_pago)
         VALUES (${cliente.id}, '2026-08-18', 100.00, 'efectivo')`
      )
    ).rejects.toThrow();
  });

  it("acepta los cinco valores del conjunto", async () => {
    const cliente = await prisma.cliente.findFirstOrThrow();

    for (const metodo of METODOS_PAGO) {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO pagos (id_cliente, fecha, monto, metodo_pago)
           VALUES (${cliente.id}, '2026-08-18', 100.00, '${metodo}')`
        )
      ).resolves.toBe(1);
    }
  });

  it("NULL sigue pasando: la columna es opcional y el CHECK se evalúa a UNKNOWN", async () => {
    const cliente = await prisma.cliente.findFirstOrThrow();

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO pagos (id_cliente, fecha, monto, metodo_pago)
         VALUES (${cliente.id}, '2026-08-18', 100.00, NULL)`
      )
    ).resolves.toBe(1);
  });
});

describe("buscarPagosDuplicados", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  it("detecta el mismo cliente+fecha+monto y no marca lo que solo se parece", async () => {
    const { a, b } = await sembrar();
    await crearPagosEnLote(ADMIN, [pago({ idCliente: a.id, fecha: "2026-08-08", monto: "1000.00" })]);

    const encontrados = await buscarPagosDuplicados([
      { idCliente: a.id, fecha: "2026-08-08", monto: "1000.00" }, // idéntico
      { idCliente: a.id, fecha: "2026-08-09", monto: "1000.00" }, // otra fecha
      { idCliente: a.id, fecha: "2026-08-08", monto: "1000.50" }, // otro monto
      { idCliente: b.id, fecha: "2026-08-08", monto: "1000.00" }, // otro cliente
    ]);

    expect(encontrados.has(claveDuplicado({ idCliente: a.id, fecha: "2026-08-08", monto: "1000.00" }))).toBe(true);
    expect(encontrados.size).toBe(1);
  });

  it("avisa pero NO impide registrar: un cobro repetido real es legítimo", async () => {
    const { a } = await sembrar();
    const fila = pago({ idCliente: a.id, fecha: "2026-08-08", monto: "1000.00" });

    await crearPagosEnLote(ADMIN, [fila]);
    const encontrados = await buscarPagosDuplicados([fila]);
    expect(encontrados.size).toBe(1);

    // El servicio no consulta duplicados ni los rechaza — es decisión del
    // operador, que la UI le presenta como aviso.
    await crearPagosEnLote(ADMIN, [fila]);
    expect(await prisma.pago.count()).toBe(2);
    expect((await obtenerSaldo(a.id)).toFixed(2)).toBe("3000.00");
  });

  it("sin candidatos no consulta nada", async () => {
    expect((await buscarPagosDuplicados([])).size).toBe(0);
  });
});

afterAll(async () => {
  await limpiarBaseDePrueba();
});
