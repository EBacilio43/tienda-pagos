import { describe, it, expect } from "vitest";
import {
  parsearMes,
  parsearDia,
  mesDelDia,
  mesAnterior,
  mesSiguiente,
  etiquetaMes,
  etiquetaDiaLargo,
  celdasDelMes,
} from "@/lib/calendario";

// El `?mes=` y el `?dia=` los escribe quien quiera en la barra de
// direcciones, así que estas dos funciones son la frontera del calendario
// con el mundo. Lo que tienen que rechazar no es una cadena cualquiera —
// eso lo hace el regex— sino la que pasa el regex y no es una fecha.
describe("parsearMes", () => {
  it("acepta un mes real", () => {
    expect(parsearMes("2026-09")).toBe("2026-09");
  });

  it("rechaza un mes que pasa el regex y no existe", () => {
    expect(parsearMes("2026-13")).toBeNull();
    expect(parsearMes("2026-00")).toBeNull();
  });

  it("rechaza forma inválida, vacío y ausente", () => {
    expect(parsearMes("2026-9")).toBeNull();
    expect(parsearMes("septiembre")).toBeNull();
    expect(parsearMes("")).toBeNull();
    expect(parsearMes(undefined)).toBeNull();
  });
});

describe("parsearDia", () => {
  it("acepta un día real", () => {
    expect(parsearDia("2026-09-05")).toBe("2026-09-05");
  });

  it("rechaza el 30 de febrero, que el regex acepta", () => {
    expect(parsearDia("2026-02-30")).toBeNull();
  });

  it("distingue un año bisiesto de uno que no lo es", () => {
    expect(parsearDia("2024-02-29")).toBe("2024-02-29");
    expect(parsearDia("2026-02-29")).toBeNull();
  });

  it("rechaza forma inválida y ausente", () => {
    expect(parsearDia("2026-09")).toBeNull();
    expect(parsearDia(undefined)).toBeNull();
  });
});

describe("navegación entre meses", () => {
  it("mesDelDia recorta el día", () => {
    expect(mesDelDia("2026-09-05")).toBe("2026-09");
  });

  it("retrocede y avanza dentro del mismo año", () => {
    expect(mesAnterior("2026-09")).toBe("2026-08");
    expect(mesSiguiente("2026-09")).toBe("2026-10");
  });

  // El caso que un `numeroMes - 1` sin normalizar rompe: da "2026-00".
  it("cruza el cambio de año en los dos sentidos", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesSiguiente("2026-12")).toBe("2027-01");
  });
});

describe("etiquetas", () => {
  // Formatear medianoche UTC del día 1 en la zona del negocio (UTC−6) lo
  // correría al mes anterior: "septiembre 2026" saldría como "agosto 2026".
  it("el primero de mes no se corre al mes anterior", () => {
    expect(etiquetaMes("2026-09")).toBe("septiembre 2026");
    expect(etiquetaMes("2026-01")).toBe("enero 2026");
  });

  it("el día largo tampoco se corre", () => {
    expect(etiquetaDiaLargo("2026-09-05")).toBe("sábado, 5 de septiembre de 2026");
  });
});

describe("celdasDelMes", () => {
  it("siempre devuelve semanas completas", () => {
    for (const mes of ["2026-01", "2026-02", "2026-09", "2024-02", "2026-11"]) {
      expect(celdasDelMes(mes).length % 7).toBe(0);
    }
  });

  // Septiembre de 2026 empieza en martes, así que la primera celda es el
  // lunes 31 de agosto. Si el desplazamiento se calculara con getUTCDay()
  // directo (domingo = 0), la cuadrícula quedaría corrida un día.
  it("la primera celda es el lunes de la semana del día 1", () => {
    const celdas = celdasDelMes("2026-09");
    expect(celdas[0].fecha).toBe("2026-08-31");
    expect(celdas[0].delMes).toBe(false);
    expect(celdas[1].fecha).toBe("2026-09-01");
    expect(celdas[1].delMes).toBe(true);
  });

  it("un mes que empieza en lunes no lleva relleno adelante", () => {
    // Junio de 2026 empieza en lunes.
    const celdas = celdasDelMes("2026-06");
    expect(celdas[0].fecha).toBe("2026-06-01");
    expect(celdas[0].delMes).toBe(true);
  });

  it("un mes que empieza en domingo lleva seis celdas de relleno", () => {
    // Febrero de 2026 empieza en domingo: el lunes previo es el 26 de enero.
    const celdas = celdasDelMes("2026-02");
    expect(celdas[0].fecha).toBe("2026-01-26");
    expect(celdas.slice(0, 6).every((c) => !c.delMes)).toBe(true);
    expect(celdas[6].fecha).toBe("2026-02-01");
  });

  it("incluye todos los días del mes y ninguno de más", () => {
    const delMes = celdasDelMes("2026-02").filter((c) => c.delMes);
    expect(delMes.length).toBe(28);
    expect(delMes[0].fecha).toBe("2026-02-01");
    expect(delMes[27].fecha).toBe("2026-02-28");
  });

  it("cuenta 29 días en febrero bisiesto", () => {
    const delMes = celdasDelMes("2024-02").filter((c) => c.delMes);
    expect(delMes.length).toBe(29);
    expect(delMes[28].fecha).toBe("2024-02-29");
  });

  it("las fechas son consecutivas y el número de día coincide", () => {
    const celdas = celdasDelMes("2026-09");
    for (let i = 1; i < celdas.length; i++) {
      const anterior = new Date(`${celdas[i - 1].fecha}T00:00:00Z`);
      const actual = new Date(`${celdas[i].fecha}T00:00:00Z`);
      expect(actual.getTime() - anterior.getTime()).toBe(86_400_000);
      expect(celdas[i].dia).toBe(actual.getUTCDate());
    }
  });

  it("cruza el cambio de año por el relleno del final", () => {
    // Diciembre de 2026 termina en jueves: el relleno llega a enero de 2027.
    const celdas = celdasDelMes("2026-12");
    const ultima = celdas[celdas.length - 1];
    expect(ultima.fecha).toBe("2027-01-03");
    expect(ultima.delMes).toBe(false);
  });
});
