import { describe, it, expect } from "vitest";
import {
  esquemaPassword,
  esquemaUsuario,
  esquemaResetPassword,
  esquemaCambiarPasswordPropia,
} from "@/lib/schemas/usuario";

describe("esquemaPassword — política de contraseñas (P8.2)", () => {
  it("acepta una contraseña válida con letras, números y al menos 8 caracteres", () => {
    expect(esquemaPassword.safeParse("Password123").success).toBe(true);
    expect(esquemaPassword.safeParse("clave123").success).toBe(true);
    expect(esquemaPassword.safeParse("1234abcd").success).toBe(true);
    expect(esquemaPassword.safeParse("SuperSegura2026!").success).toBe(true);
  });

  it("rechaza contraseñas con menos de 8 caracteres", () => {
    const res = esquemaPassword.safeParse("Pass12");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe("Mínimo 8 caracteres");
    }
  });

  it("rechaza contraseñas sin números", () => {
    const res = esquemaPassword.safeParse("Sololetras");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("número"))).toBe(true);
    }
  });

  it("rechaza contraseñas sin letras", () => {
    const res = esquemaPassword.safeParse("12345678");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes("letra"))).toBe(true);
    }
  });
});

describe("esquemaUsuario — política aplicada a creación de usuarios", () => {
  const usuarioBase = {
    username: "usuario1",
    nombreCompleto: "Usuario Prueba",
    rol: "operador",
  };

  it("acepta usuario con contraseña que cumple la política", () => {
    const res = esquemaUsuario.safeParse({
      ...usuarioBase,
      password: "Valida1234",
    });
    expect(res.success).toBe(true);
  });

  it("rechaza usuario con contraseña corta o sin número", () => {
    expect(
      esquemaUsuario.safeParse({
        ...usuarioBase,
        password: "corta",
      }).success
    ).toBe(false);

    expect(
      esquemaUsuario.safeParse({
        ...usuarioBase,
        password: "sololetraslargas",
      }).success
    ).toBe(false);
  });
});

describe("esquemaResetPassword — política aplicada a reset de contraseña", () => {
  it("acepta contraseñas coincidentes que cumplen la política", () => {
    const res = esquemaResetPassword.safeParse({
      password: "NuevaPassword2026",
      confirmar: "NuevaPassword2026",
    });
    expect(res.success).toBe(true);
  });

  it("rechaza si no cumple la política aunque coincidan", () => {
    const res = esquemaResetPassword.safeParse({
      password: "sololetras",
      confirmar: "sololetras",
    });
    expect(res.success).toBe(false);
  });

  it("rechaza si no coinciden", () => {
    const res = esquemaResetPassword.safeParse({
      password: "Password123",
      confirmar: "Password456",
    });
    expect(res.success).toBe(false);
  });
});

describe("esquemaCambiarPasswordPropia — política aplicada a cambio de contraseña", () => {
  it("acepta cambio cuando la nueva cumple la política y coincide", () => {
    const res = esquemaCambiarPasswordPropia.safeParse({
      passwordActual: "Cualquiera1!",
      passwordNueva: "NuevaClave2026",
      confirmar: "NuevaClave2026",
    });
    expect(res.success).toBe(true);
  });

  it("rechaza si la nueva contraseña no tiene número", () => {
    const res = esquemaCambiarPasswordPropia.safeParse({
      passwordActual: "Cualquiera1!",
      passwordNueva: "NuevaSinNumero",
      confirmar: "NuevaSinNumero",
    });
    expect(res.success).toBe(false);
  });

  it("rechaza si la nueva contraseña no tiene letra", () => {
    const res = esquemaCambiarPasswordPropia.safeParse({
      passwordActual: "Cualquiera1!",
      passwordNueva: "123456789",
      confirmar: "123456789",
    });
    expect(res.success).toBe(false);
  });

  it("rechaza si la nueva contraseña tiene menos de 8 caracteres", () => {
    const res = esquemaCambiarPasswordPropia.safeParse({
      passwordActual: "Cualquiera1!",
      passwordNueva: "Abc1",
      confirmar: "Abc1",
    });
    expect(res.success).toBe(false);
  });
});
