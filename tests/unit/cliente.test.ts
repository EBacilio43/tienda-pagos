import { describe, it, expect } from "vitest";
import { esquemaCliente, normalizarNombre } from "@/lib/schemas/cliente";

describe("normalizarNombre", () => {
  it("elimina espacios al inicio y al final", () => {
    expect(normalizarNombre("   Juan Pérez   ")).toBe("Juan Pérez");
  });

  it("colapsa múltiples espacios intermedios a un solo espacio", () => {
    expect(normalizarNombre("Juan     de    Dios    Pérez")).toBe("Juan de Dios Pérez");
  });

  it("colapsa saltos de línea y tabuladores intermedios", () => {
    expect(normalizarNombre("María \t  Elena \n\n  López")).toBe("María Elena López");
  });

  it("deja intacto un nombre ya normalizado", () => {
    expect(normalizarNombre("Carlos Santana")).toBe("Carlos Santana");
  });
});

describe("esquemaCliente — validación y normalización", () => {
  it("normaliza espacios en el nombre al procesar el esquema", () => {
    const parsed = esquemaCliente.safeParse({ nombre: "  Juan   Carlos   Pérez  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.nombre).toBe("Juan Carlos Pérez");
    }
  });

  it("rechaza nombre compuesto solo por espacios en blanco", () => {
    const parsed = esquemaCliente.safeParse({ nombre: "      " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.nombre).toContain("El nombre es obligatorio");
    }
  });

  it("rechaza nombre vacío", () => {
    const parsed = esquemaCliente.safeParse({ nombre: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.nombre).toContain("El nombre es obligatorio");
    }
  });

  it("rechaza nombre que excede 150 caracteres", () => {
    const nombreLargo = "A".repeat(151);
    const parsed = esquemaCliente.safeParse({ nombre: nombreLargo });
    expect(parsed.success).toBe(false);
  });

  it("limpia y convierte a undefined campos opcionales vacíos", () => {
    const parsed = esquemaCliente.safeParse({
      nombre: "Ana Gómez",
      telefono: "   ",
      empresa: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.telefono).toBeUndefined();
      expect(parsed.data.empresa).toBeUndefined();
    }
  });
});
