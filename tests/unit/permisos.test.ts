import { describe, it, expect } from "vitest";
import {
  puedeCrearEditarClientes,
  puedeEliminarClientes,
  puedeAjustarStock,
  puedeGestionarCatalogo,
  puedeGestionarTransacciones,
  puedeGestionarUsuarios,
  ErrorPermiso,
} from "@/lib/permisos";
import type { Rol } from "@/types/dominio";

// ADR-09: la matriz completa, un caso por celda. Barata de escribir y es
// justo el tipo de código donde un typo ("operador" vs "operator", o un
// rol nuevo que se olvida agregar a una función) pasa lint y tsc sin
// problema pero abre o cierra una puerta de permisos silenciosamente.
const ROLES: Rol[] = ["consulta", "operador", "admin"];

describe("matriz de permisos (ADR-09)", () => {
  it.each([
    ["puedeCrearEditarClientes", puedeCrearEditarClientes, { consulta: false, operador: true, admin: true }],
    ["puedeEliminarClientes", puedeEliminarClientes, { consulta: false, operador: false, admin: true }],
    ["puedeAjustarStock", puedeAjustarStock, { consulta: false, operador: true, admin: true }],
    ["puedeGestionarCatalogo", puedeGestionarCatalogo, { consulta: false, operador: false, admin: true }],
    ["puedeGestionarTransacciones", puedeGestionarTransacciones, { consulta: false, operador: true, admin: true }],
    ["puedeGestionarUsuarios", puedeGestionarUsuarios, { consulta: false, operador: false, admin: true }],
  ] as const)("%s", (_nombre, fn, esperado) => {
    for (const rol of ROLES) {
      expect(fn(rol), `rol=${rol}`).toBe(esperado[rol]);
    }
  });
});

describe("ErrorPermiso", () => {
  it("es distinguible de un Error genérico (para no filtrar detalles internos)", () => {
    const err = new ErrorPermiso();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ErrorPermiso");
  });

  it("acepta un mensaje custom", () => {
    expect(new ErrorPermiso("mensaje custom").message).toBe("mensaje custom");
  });

  it("tiene un mensaje por default seguro de mostrar al usuario", () => {
    expect(new ErrorPermiso().message.length).toBeGreaterThan(0);
  });
});
