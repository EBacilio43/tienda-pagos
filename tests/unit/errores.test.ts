import { describe, it, expect } from "vitest";
import { ErrorDominio } from "@/lib/errores";

describe("ErrorDominio", () => {
  it("es un Error distinguible por nombre (para no filtrar detalles internos)", () => {
    const err = new ErrorDominio("Stock insuficiente para X");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ErrorDominio");
    expect(err.message).toBe("Stock insuficiente para X");
  });
});
