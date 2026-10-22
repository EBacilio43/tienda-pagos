import { describe, it, expect } from "vitest";
import {
  REGEX_MONTO,
  REGEX_MONTO_POSITIVO,
  sumarMontos,
  restarMontos,
  multiplicarMonto,
  compararMontos,
  formatearMoneda,
} from "@/lib/money";

// AGENTS.md regla 1: toda esta aritmética pasa por centavos-como-BigInt,
// nunca Number()/parseFloat(). Estos casos existen porque el punto
// flotante es exactamente donde algo así fallaría en silencio
// (0.1 + 0.2 !== 0.3) sin que ningún tipo lo marque.
describe("sumarMontos", () => {
  it("suma exacta sin el error clásico de punto flotante", () => {
    expect(sumarMontos("0.10", "0.20")).toBe("0.30");
  });

  it("suma múltiples montos con distintos decimales", () => {
    expect(sumarMontos("100", "50.5", "0.25")).toBe("150.75");
  });

  it("sin argumentos da 0.00", () => {
    expect(sumarMontos()).toBe("0.00");
  });

  it("maneja negativos (saldo a favor, docs/DOMINIO.md)", () => {
    expect(sumarMontos("100.00", "-150.00")).toBe("-50.00");
  });

  it("monto grande no pierde precisión (BigInt, no Number)", () => {
    // Number.MAX_SAFE_INTEGER en centavos ya no es seguro sumar con floats.
    expect(sumarMontos("99999999.99", "0.01")).toBe("100000000.00");
  });
});

describe("restarMontos", () => {
  it("resta exacta sin error de punto flotante", () => {
    expect(restarMontos("0.30", "0.10")).toBe("0.20");
  });

  it("resta que da cero", () => {
    expect(restarMontos("100.50", "100.50")).toBe("0.00");
  });

  it("resta que da saldo negativo (a favor)", () => {
    expect(restarMontos("100.00", "150.00")).toBe("-50.00");
  });

  it("resta sobre saldo ya negativo", () => {
    expect(restarMontos("-50.00", "25.00")).toBe("-75.00");
  });

  it("monto grande no pierde precisión", () => {
    expect(restarMontos("100000000.00", "0.01")).toBe("99999999.99");
  });
});

describe("multiplicarMonto", () => {
  it("cantidad entera simple", () => {
    expect(multiplicarMonto("150.50", 3)).toBe("451.50");
  });

  it("cantidad 0 da 0.00", () => {
    expect(multiplicarMonto("999.99", 0)).toBe("0.00");
  });

  it("trunca cantidad no entera (nunca debería llegar así, pero no debe tronar)", () => {
    expect(multiplicarMonto("10.00", 2.9)).toBe("20.00");
  });
});

describe("formatearMoneda", () => {
  it("agrega separador de miles y dos decimales", () => {
    expect(formatearMoneda("1234567.5")).toBe("$1,234,567.50");
  });

  it("monto negativo con signo antes del $", () => {
    expect(formatearMoneda("-500.00")).toBe("-$500.00");
  });

  it("monto sin decimales explícitos", () => {
    expect(formatearMoneda("100")).toBe("$100.00");
  });

  it("cero", () => {
    expect(formatearMoneda("0")).toBe("$0.00");
  });
});

describe("REGEX_MONTO", () => {
  it.each(["0.00", "100", "999999999.99", "0", "1.5"])("acepta %s", (v) => {
    expect(REGEX_MONTO.test(v)).toBe(true);
  });

  it.each(["-1.00", "1.999", "abc", "", "1,000.00", "1000000000"])("rechaza %s", (v) => {
    expect(REGEX_MONTO.test(v)).toBe(false);
  });
});

describe("REGEX_MONTO_POSITIVO", () => {
  it.each(["0.01", "1", "100.50"])("acepta %s", (v) => {
    expect(REGEX_MONTO_POSITIVO.test(v)).toBe(true);
  });

  // El caso que le importa a P0: un monto en $0.00 no es un monto válido
  // para un pago o un enganche, aunque sí lo sea como precio unitario libre.
  it.each(["0", "0.00", "0.0", "-1", "abc"])("rechaza %s", (v) => {
    expect(REGEX_MONTO_POSITIVO.test(v)).toBe(false);
  });
});

// El tope de la devolución ("no acredites más de lo que costó") se decide
// con esto, del lado del cliente y sin Number(): un `===` de strings diría
// que "2500" y "2500.00" son montos distintos, y el formulario marcaría
// como ajustado un renglón que nadie tocó.
describe("compararMontos", () => {
  it("trata como iguales dos escrituras del mismo monto", () => {
    expect(compararMontos("2500", "2500.00")).toBe(0);
    expect(compararMontos("2500.0", "2500.00")).toBe(0);
    expect(compararMontos("0", "0.00")).toBe(0);
  });

  it("ordena por valor, no por texto", () => {
    // "9.00" > "10.00" si se comparara como cadena.
    expect(compararMontos("9.00", "10.00")).toBe(-1);
    expect(compararMontos("10.00", "9.00")).toBe(1);
    expect(compararMontos("3000.01", "3000.00")).toBe(1);
  });

  it("no pierde el centavo en la frontera del tope", () => {
    expect(compararMontos("2999.99", "3000.00")).toBe(-1);
    expect(compararMontos("3000.00", "3000.00")).toBe(0);
  });

  it("maneja negativos (el saldo a favor existe, docs/DOMINIO.md)", () => {
    expect(compararMontos("-100.00", "0.00")).toBe(-1);
    expect(compararMontos("-100.00", "-200.00")).toBe(1);
  });
});
