import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { crearCliente, actualizarCliente } from "@/server/services/clientes";
import { ErrorDominio } from "@/lib/errores";
import type { DatosCliente } from "@/lib/schemas/cliente";

const ADMIN = { id: 1, rol: "admin" as const };

// DatosCliente es el tipo de salida de Zod: los .transform() en campos opcionales
// dejan las claves presentes con valor undefined. Este helper las rellena para que las
// pruebas se lean claras sin boilerplate repetido.
function datosCliente(p: { nombre: string } & Partial<DatosCliente>): DatosCliente {
  return {
    email: undefined,
    telefono: undefined,
    empresa: undefined,
    calle: undefined,
    numExt: undefined,
    numInt: undefined,
    colonia: undefined,
    municipio: undefined,
    estado: undefined,
    cp: undefined,
    ...p,
  };
}

async function crearUsuarioAdmin() {
  await prisma.usuario.create({
    data: {
      id: 1,
      username: "admin_test",
      nombreCompleto: "Admin Test",
      rol: "admin",
      passwordHash: "x",
      activo: true,
      intentosFallidos: 0,
      creadoEn: new Date(),
    },
  });
}

describe("Unicidad e integridad de clientes ()", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
    await crearUsuarioAdmin();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("crear cliente 'Juan Pérez' e intentar crear concurrentemente otro 'Juan Pérez' rechaza con mensaje amigable", async () => {
    // Disparo concurrente real de dos transacciones paralelas intentando crear el mismo nombre
    const promesas = [
      crearCliente(ADMIN, datosCliente({ nombre: "Juan Pérez" })),
      crearCliente(ADMIN, datosCliente({ nombre: "Juan Pérez" })),
    ];

    const resultados = await Promise.allSettled(promesas);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r) => r.status === "rejected");

    // Exactamente uno debe tener éxito y el otro debe ser rechazado
    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);

    const rechazo = rechazados[0] as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ErrorDominio);
    expect(rechazo.reason.message).toBe('Ya existe un cliente con el nombre "Juan Pérez"');

    // La base de datos debe contener exactamente 1 registro
    const enBd = await prisma.cliente.findMany({ where: { nombre: "Juan Pérez" } });
    expect(enBd).toHaveLength(1);
  });

  it("intento secuencial de crear duplicado 'Juan Pérez' también se rechaza con ErrorDominio", async () => {
    await crearCliente(ADMIN, datosCliente({ nombre: "Juan Pérez" }));

    await expect(crearCliente(ADMIN, datosCliente({ nombre: "Juan Pérez" }))).rejects.toThrow(
      'Ya existe un cliente con el nombre "Juan Pérez"'
    );
  });

  it("intento de crear ' Juan   Pérez  ' normaliza espacios y se detecta como duplicado", async () => {
    await crearCliente(ADMIN, datosCliente({ nombre: "Juan Pérez" }));

    // Con espacios al inicio, al final y múltiples intermedios
    const intento = crearCliente(ADMIN, datosCliente({ nombre: "  Juan   Pérez  " }));

    await expect(intento).rejects.toBeInstanceOf(ErrorDominio);
    await expect(intento).rejects.toThrow('Ya existe un cliente con el nombre "Juan Pérez"');
  });

  it("guarda el nombre normalizado en BD sin espacios redundantes", async () => {
    const { id } = await crearCliente(ADMIN, datosCliente({ nombre: "  María   Elena   López  " }));

    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id } });
    expect(cliente.nombre).toBe("María Elena López");

    // En auditoría también se guarda el nombre normalizado
    const auditoria = await prisma.auditoria.findFirstOrThrow({
      where: { tablaAfectada: "clientes", registroId: String(id), accion: "crear" },
    });
    const datosNuevos = auditoria.datosNuevos as { nombre?: string };
    expect(datosNuevos.nombre).toBe("María Elena López");
  });

  it("rechaza actualizar otro cliente con un nombre ya existente", async () => {
    const c1 = await crearCliente(ADMIN, datosCliente({ nombre: "Juan Pérez" }));
    const c2 = await crearCliente(ADMIN, datosCliente({ nombre: "Carlos López" }));

    // Intentar renombrar c2 al nombre de c1 exacto
    await expect(
      actualizarCliente(ADMIN, c2.id, datosCliente({ nombre: "Juan Pérez" }))
    ).rejects.toThrow('Ya existe otro cliente con el nombre "Juan Pérez"');

    // Intentar renombrar c2 al nombre de c1 con espacios redundantes
    await expect(
      actualizarCliente(ADMIN, c2.id, datosCliente({ nombre: "   Juan    Pérez   " }))
    ).rejects.toThrow('Ya existe otro cliente con el nombre "Juan Pérez"');

    // Pero c1 puede actualizar sus propios datos y conservar su nombre
    await expect(
      actualizarCliente(ADMIN, c1.id, datosCliente({ nombre: "  Juan   Pérez  ", telefono: "555-9876" }))
    ).resolves.toBeUndefined();

    const c1Actualizado = await prisma.cliente.findUniqueOrThrow({ where: { id: c1.id } });
    expect(c1Actualizado.nombre).toBe("Juan Pérez");
    expect(c1Actualizado.telefono).toBe("555-9876");
  });

  it("actualizaciones concurrentes de dos clientes al mismo nombre rechazan una con ErrorDominio", async () => {
    const c1 = await crearCliente(ADMIN, datosCliente({ nombre: "Cliente Alfa" }));
    const c2 = await crearCliente(ADMIN, datosCliente({ nombre: "Cliente Beta" }));

    const resultados = await Promise.allSettled([
      actualizarCliente(ADMIN, c1.id, datosCliente({ nombre: "Mismo Nombre" })),
      actualizarCliente(ADMIN, c2.id, datosCliente({ nombre: "Mismo Nombre" })),
    ]);

    const exitosos = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r) => r.status === "rejected");

    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);

    const rechazo = rechazados[0] as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ErrorDominio);
    expect(rechazo.reason.message).toContain('Mismo Nombre');
  });
});
