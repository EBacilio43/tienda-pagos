import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mensajeDeError } from "@/server/actions/manejar-error";
import { ErrorDominio } from "@/lib/errores";
import { ErrorPermiso } from "@/lib/permisos";

// el punto entero de este helper es que un error inesperado
// (Prisma, red, un bug) nunca llegue crudo a la pantalla, y que sí quede
// registrado — a diferencia del `err.message` genérico que se devolvía
// antes sin dejar rastro. Estas pruebas fijan las dos mitades de esa regla.
describe("mensajeDeError", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("ErrorDominio: devuelve el mensaje tal cual, sin registrar nada", () => {
    const mensaje = mensajeDeError(new ErrorDominio("Stock insuficiente para X"), { accion: "test" });
    expect(mensaje).toBe("Stock insuficiente para X");
    expect(spy).not.toHaveBeenCalled();
  });

  it("ErrorPermiso: devuelve el mensaje tal cual, sin registrar nada", () => {
    const mensaje = mensajeDeError(new ErrorPermiso(), { accion: "test" });
    expect(mensaje).toBe("No tienes permiso para realizar esta acción.");
    expect(spy).not.toHaveBeenCalled();
  });

  it("un Error inesperado: NO expone err.message al usuario, y SÍ lo registra", () => {
    const original = new Error("relation \"clientes\" violates constraint xyz — detalle interno de Prisma");
    const mensaje = mensajeDeError(original, { accion: "crearVenta", actorId: 7 });

    expect(mensaje).not.toContain("relation");
    expect(mensaje).not.toContain("constraint");
    expect(mensaje.length).toBeGreaterThan(0);

    expect(spy).toHaveBeenCalledTimes(1);
    const logueado = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logueado.accion).toBe("crearVenta");
    expect(logueado.actorId).toBe(7);
    expect(logueado.error.mensaje).toContain("relation");
  });

  it("un valor no-Error lanzado (throw \"string\") tampoco revienta y sí se registra", () => {
    const mensaje = mensajeDeError("algo raro", { accion: "test" });
    expect(mensaje.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("el mismo contexto pasado se refleja en el log (para poder rastrear el caso real)", () => {
    mensajeDeError(new Error("boom"), { accion: "eliminarVenta", actorId: 3, ventaId: 99 });
    const logueado = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logueado).toMatchObject({ accion: "eliminarVenta", actorId: 3, ventaId: 99, nivel: "error" });
    expect(typeof logueado.timestamp).toBe("string");
  });
});
