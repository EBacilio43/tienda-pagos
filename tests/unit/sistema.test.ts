import { describe, it, expect } from "vitest";
import {
  formatearBytes,
  formatearDuracion,
  formatearMs,
  mediana,
  nivelPorUmbral,
} from "@/lib/sistema";

// El formato de /admin/sistema. Un panel de diagnóstico que redondea mal o
// que imprime "NaN ms" es peor que no tenerlo: se usa exactamente cuando
// alguien está tratando de decidir si algo está roto.

describe("formatearBytes", () => {
  it("escala a la unidad que deja el número legible, en base 1024", () => {
    expect(formatearBytes(0)).toBe("0 B");
    expect(formatearBytes(900)).toBe("900 B");
    expect(formatearBytes(1024)).toBe("1 KB");
    // La misma base que usa `docker stats`, para que el número coincida
    // con el que se ve en la terminal diagnosticando el mismo contenedor.
    expect(formatearBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatearBytes(1024 ** 3 * 1.5)).toBe("1.5 GB");
  });

  it("un decimal a partir de MB, ninguno por debajo", () => {
    expect(formatearBytes(1536)).toBe("2 KB");
    expect(formatearBytes(1024 * 1024 * 1.25)).toBe("1.3 MB");
  });

  it("un valor imposible no imprime NaN", () => {
    expect(formatearBytes(Number.NaN)).toBe("—");
    expect(formatearBytes(-1)).toBe("—");
  });
});

describe("formatearDuracion", () => {
  it("se corta en dos unidades", () => {
    expect(formatearDuracion(45)).toBe("45 s");
    expect(formatearDuracion(125)).toBe("2 min 05 s");
    expect(formatearDuracion(3600 * 4 + 60 * 12)).toBe("4 h 12 min");
    expect(formatearDuracion(86400 * 3 + 3600 * 4)).toBe("3 d 04 h");
  });

  it("un uptime recién arrancado no se muestra vacío", () => {
    expect(formatearDuracion(0)).toBe("0 s");
    expect(formatearDuracion(0.8)).toBe("0 s");
  });

  it("un valor imposible no imprime NaN", () => {
    expect(formatearDuracion(Number.NaN)).toBe("—");
  });
});

describe("formatearMs", () => {
  it("da más precisión cuanto más chico es el número", () => {
    // Contra la base local los viajes son de décimas de milisegundo:
    // redondear a entero los mostraría todos como "0 ms".
    expect(formatearMs(0.45)).toBe("0.5 ms");
    expect(formatearMs(26.4)).toBe("26 ms");
    expect(formatearMs(1500)).toBe("1.50 s");
  });

  it("null es ausencia de medición, no cero", () => {
    expect(formatearMs(null)).toBe("—");
  });
});

describe("mediana", () => {
  it("no la arrastra una sola muestra lenta, a diferencia del promedio", () => {
    // Caso real medido: la primera consulta paga la conexión fría.
    const muestras = [0.46, 0.52, 0.53, 0.55, 26.04];
    expect(mediana(muestras)).toBe(0.53);
  });

  it("con un número par de muestras promedia las dos centrales", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it("no muta el arreglo que recibe", () => {
    const muestras = [3, 1, 2];
    mediana(muestras);
    expect(muestras).toEqual([3, 1, 2]);
  });

  it("sin muestras devuelve null, no 0", () => {
    expect(mediana([])).toBeNull();
  });
});

describe("nivelPorUmbral", () => {
  it("clasifica en los tres niveles con el umbral inclusivo", () => {
    expect(nivelPorUmbral(50, 75, 90)).toBe("bien");
    expect(nivelPorUmbral(75, 75, 90)).toBe("aviso");
    expect(nivelPorUmbral(90, 75, 90)).toBe("critico");
    expect(nivelPorUmbral(99.9, 75, 90)).toBe("critico");
  });

  it("una métrica que no se pudo medir no se pinta de rojo", () => {
    // null es "no hay cuota de cgroup / no se pudo leer", no "está mal".
    expect(nivelPorUmbral(null, 75, 90)).toBe("bien");
    expect(nivelPorUmbral(Number.NaN, 75, 90)).toBe("bien");
  });
});
