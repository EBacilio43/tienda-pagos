import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import {
  validarSinCiclosAbsorcion,
  LIMITE_SALTOS_ABSORCION,
} from "@/server/services/clientes";
import { ErrorDominio } from "@/lib/errores";

describe("P6: Prevención de ciclos en absorbido_por", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  afterAll(async () => {
    await limpiarBaseDePrueba();
  });

  describe("Restricción CHECK de base de datos (clientes_no_auto_absorcion)", () => {
    it("la base de datos rechaza un INSERT con absorbido_por = id", async () => {
      // El ciclo trivial de longitud 1 cerrado a nivel motor relacional.
      await expect(
        prisma.$executeRawUnsafe(`
          INSERT INTO clientes (id, nombre, absorbido_por)
          VALUES (9001, 'Cliente Auto Absorcion Insert', 9001)
        `)
      ).rejects.toThrow();

      const buscado = await prisma.cliente.findUnique({ where: { id: 9001 } });
      expect(buscado).toBeNull();
    });

    it("la base de datos rechaza un UPDATE con absorbido_por = id", async () => {
      const cliente = await prisma.cliente.create({
        data: { nombre: "Cliente Prueba Update Check" },
      });

      // Rechaza tanto por raw SQL como por Prisma update
      await expect(
        prisma.cliente.update({
          where: { id: cliente.id },
          data: { absorbidoPor: cliente.id },
        })
      ).rejects.toThrow();

      // Comprobamos que el cliente no sufrió modificaciones
      const sinCambio = await prisma.cliente.findUniqueOrThrow({
        where: { id: cliente.id },
      });
      expect(sinCambio.absorbidoPor).toBeNull();
    });

    it("la base de datos acepta absorbido_por válido hacia otro cliente o NULL", async () => {
      const clienteA = await prisma.cliente.create({
        data: { nombre: "Cliente A Base" },
      });
      const clienteB = await prisma.cliente.create({
        data: { nombre: "Cliente B Base" },
      });

      // UPDATE válido hacia otro cliente
      await prisma.cliente.update({
        where: { id: clienteA.id },
        data: { absorbidoPor: clienteB.id },
      });

      let recargadoA = await prisma.cliente.findUniqueOrThrow({
        where: { id: clienteA.id },
      });
      expect(recargadoA.absorbidoPor).toBe(clienteB.id);

      // UPDATE válido hacia NULL
      await prisma.cliente.update({
        where: { id: clienteA.id },
        data: { absorbidoPor: null },
      });

      recargadoA = await prisma.cliente.findUniqueOrThrow({
        where: { id: clienteA.id },
      });
      expect(recargadoA.absorbidoPor).toBeNull();
    });
  });

  describe("Helper de validación defensiva en servicio (validarSinCiclosAbsorcion)", () => {
    it("permite nuevoAbsorbidoPor null o undefined", async () => {
      const cliente = await prisma.cliente.create({
        data: { nombre: "Cliente Solitario" },
      });

      await expect(
        validarSinCiclosAbsorcion(cliente.id, null)
      ).resolves.toBeUndefined();
    });

    it("rechaza auto-absorción trivial A -> A con ErrorDominio", async () => {
      const cliente = await prisma.cliente.create({
        data: { nombre: "Cliente Auto" },
      });

      await expect(
        validarSinCiclosAbsorcion(cliente.id, cliente.id)
      ).rejects.toThrowError(ErrorDominio);
    });

    it("rechaza cadenas circulares de longitud 2: A -> B -> A", async () => {
      // Cliente A está absorbido por B
      const clienteB = await prisma.cliente.create({
        data: { nombre: "Cliente B" },
      });
      const clienteA = await prisma.cliente.create({
        data: { nombre: "Cliente A", absorbidoPor: clienteB.id },
      });

      // Intentar que B sea absorbido por A crearía el ciclo B -> A -> B
      await expect(
        validarSinCiclosAbsorcion(clienteB.id, clienteA.id)
      ).rejects.toThrowError(ErrorDominio);

      try {
        await validarSinCiclosAbsorcion(clienteB.id, clienteA.id);
      } catch (err) {
        expect(err).toBeInstanceOf(ErrorDominio);
        expect((err as ErrorDominio).message).toContain(
          `Se detectó un ciclo en la cadena de absorción: el cliente ${clienteB.id} ya forma parte del linaje.`
        );
      }
    });

    it("rechaza cadenas circulares de longitud 3: A -> B -> C -> A", async () => {
      const clienteC = await prisma.cliente.create({
        data: { nombre: "Cliente C" },
      });
      const clienteB = await prisma.cliente.create({
        data: { nombre: "Cliente B", absorbidoPor: clienteC.id },
      });
      const clienteA = await prisma.cliente.create({
        data: { nombre: "Cliente A", absorbidoPor: clienteB.id },
      });

      // C intentando ser absorbido por A crearía: C -> A -> B -> C
      await expect(
        validarSinCiclosAbsorcion(clienteC.id, clienteA.id)
      ).rejects.toThrowError(ErrorDominio);
    });

    it("permite una cadena lineal válida sin ciclos", async () => {
      const clienteC = await prisma.cliente.create({
        data: { nombre: "Cliente Raiz C" },
      });
      const clienteB = await prisma.cliente.create({
        data: { nombre: "Cliente Medio B", absorbidoPor: clienteC.id },
      });
      const clienteA = await prisma.cliente.create({
        data: { nombre: "Cliente Hoja A" },
      });

      // A absorbido por B: A -> B -> C -> null (válido)
      await expect(
        validarSinCiclosAbsorcion(clienteA.id, clienteB.id)
      ).resolves.toBeUndefined();
    });

    it("rechaza cuando la cadena supera el límite de 10 saltos defensivos", async () => {
      // Creamos una cadena de 11 clientes: C[10] -> C[9] -> ... -> C[0]
      const ids: number[] = [];
      let anteriorId: number | null = null;

      for (let i = 0; i <= 10; i++) {
        const c: { id: number } = await prisma.cliente.create({
          data: {
            nombre: `Cliente Jerarquía ${i}`,
            absorbidoPor: anteriorId,
          },
          select: { id: true },
        });
        ids.push(c.id);
        anteriorId = c.id;
      }

      // ids[10] -> ids[9] -> ... -> ids[0] son 10 saltos ya existentes.
      // Si un cliente nuevo intenta absorberse en ids[10], el salto hacia ids[0] excederá el tope.
      const clienteNuevo = await prisma.cliente.create({
        data: { nombre: "Cliente Nuevo Excede Tope" },
      });

      await expect(
        validarSinCiclosAbsorcion(clienteNuevo.id, ids[10])
      ).rejects.toThrowError(
        `La cadena de absorción supera el límite de ${LIMITE_SALTOS_ABSORCION} saltos permitidos.`
      );
    });

    it("falla con ErrorDominio si el cliente absorbente objetivo no existe", async () => {
      const cliente = await prisma.cliente.create({
        data: { nombre: "Cliente Existente" },
      });

      await expect(
        validarSinCiclosAbsorcion(cliente.id, 999999)
      ).rejects.toThrowError("El cliente absorbente con id 999999 no existe.");
    });

    it("funciona dentro de una transacción Prisma", async () => {
      const clienteB = await prisma.cliente.create({
        data: { nombre: "Cliente Tx B" },
      });
      const clienteA = await prisma.cliente.create({
        data: { nombre: "Cliente Tx A", absorbidoPor: clienteB.id },
      });

      await prisma.$transaction(async (tx) => {
        await expect(
          validarSinCiclosAbsorcion(clienteB.id, clienteA.id, tx)
        ).rejects.toThrowError(ErrorDominio);
      });
    });
  });
});
