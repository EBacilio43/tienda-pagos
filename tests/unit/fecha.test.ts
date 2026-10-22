import { describe, it, expect } from "vitest";
import {
  fechaAString,
  hoyEnZonaDelNegocio,
  primerDiaDelMesUTC,
  primerDiaMesAnteriorUTC,
  haceNDiasUTC,
  fechaHoraSegundosAString,
  tiempoRelativo,
} from "@/lib/fecha";

// AGENTS.md regla 2: ventas.fecha/pagos.fecha/devoluciones.fecha son DATE,
// Prisma las mapea a medianoche UTC. El bug real que esta regla previene:
// en México (UTC-6), medianoche UTC del día 10 es las 18:00 del día 9 en
// hora local — `toLocaleDateString()` (o cualquier getter no-UTC) muestra
// el día anterior. Estas pruebas fijan ese comportamiento con un caso
// donde el bug sería visible si alguien lo reintrodujera.
describe("fechaAString", () => {
  it("una fecha DATE a medianoche UTC no se corre un día", () => {
    // Como Prisma la devolvería para una columna DATE.
    const fecha = new Date("2026-08-10T00:00:00.000Z");
    expect(fechaAString(fecha)).toBe("2026-08-10");
  });

  it("funciona en el borde de fin de año", () => {
    expect(fechaAString(new Date("2025-12-31T00:00:00.000Z"))).toBe("2025-12-31");
  });

  it("rellena mes y día con cero a la izquierda", () => {
    expect(fechaAString(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
  });
});

describe("primerDiaDelMesUTC", () => {
  it("da el día 1 del mes de la fecha de referencia, en UTC", () => {
    const referencia = new Date("2026-08-15T23:59:00.000Z");
    expect(fechaAString(primerDiaDelMesUTC(referencia))).toBe("2026-08-01");
  });
});

describe("primerDiaMesAnteriorUTC", () => {
  it("retrocede un mes", () => {
    const referencia = new Date("2026-08-15T00:00:00.000Z");
    expect(fechaAString(primerDiaMesAnteriorUTC(referencia))).toBe("2026-07-01");
  });

  it("cruza el borde de año (enero -> diciembre del año anterior)", () => {
    const referencia = new Date("2026-01-15T00:00:00.000Z");
    expect(fechaAString(primerDiaMesAnteriorUTC(referencia))).toBe("2025-12-01");
  });
});

describe("haceNDiasUTC", () => {
  it("0 días = hoy mismo", () => {
    const referencia = new Date("2026-08-10T12:00:00.000Z");
    expect(fechaAString(haceNDiasUTC(0, referencia))).toBe("2026-08-10");
  });

  it("6 días = 'últimos 7 días incluyendo hoy'", () => {
    const referencia = new Date("2026-08-10T12:00:00.000Z");
    expect(fechaAString(haceNDiasUTC(6, referencia))).toBe("2026-08-04");
  });

  it("cruza el borde de mes hacia atrás", () => {
    const referencia = new Date("2026-08-03T12:00:00.000Z");
    expect(fechaAString(haceNDiasUTC(6, referencia))).toBe("2026-07-28");
  });
});

// El bug hermano del de arriba, y el que de verdad corrompía datos: no leer
// una columna DATE, sino ESCRIBIR "hoy". El servidor corre en UTC, así que
// entre las 18:00 y la medianoche de México UTC ya está en el día
// siguiente. Estas pruebas fijan justo esa ventana — la hora a la que se
// captura el cobro del día.
describe("hoyEnZonaDelNegocio", () => {
  it("a las 22:20 de México sigue siendo el mismo día, aunque UTC ya cambió", () => {
    // 2026-09-02T04:20Z == 2026-09-01 22:20 en México (UTC-6).
    const referencia = new Date("2026-09-02T04:20:00.000Z");
    expect(referencia.toISOString().slice(0, 10)).toBe("2026-09-02"); // el atajo malo
    expect(hoyEnZonaDelNegocio(referencia)).toBe("2026-09-01");
  });

  it("justo antes de las 18:00 locales aún no hay divergencia", () => {
    // 2026-09-01T23:59Z == 2026-09-01 17:59 en México.
    expect(hoyEnZonaDelNegocio(new Date("2026-09-01T23:59:00.000Z"))).toBe("2026-09-01");
  });

  it("cruza el borde de año en la ventana mala", () => {
    // 2027-01-01T03:00Z == 2026-12-31 21:00 en México.
    expect(hoyEnZonaDelNegocio(new Date("2027-01-01T03:00:00.000Z"))).toBe("2026-12-31");
  });

  it("en verano tampoco hay horario de verano: México lo abolió en 2022", () => {
    // Si la base de datos de zonas horarias reintrodujera DST, esto sería
    // 2026-07-15 19:20 y la fecha seguiría siendo la misma — la prueba
    // fallaría solo si la zona cambiara de offset, que es lo que vigila.
    expect(hoyEnZonaDelNegocio(new Date("2026-07-16T01:20:00.000Z"))).toBe("2026-07-15");
  });
});

// Los dos helpers que agregó el módulo de usuarios y el detalle de
// auditoría. `fechaHoraSegundosAString` es la contraparte con segundos de
// `fechaHoraAString`: NO es una columna DATE (regla 2), es un timestamp
// real, así que formatearlo en la zona del negocio es correcto.
describe("fechaHoraSegundosAString", () => {
  it("incluye los segundos, que es lo único que lo separa de fechaHoraAString", () => {
    // 2026-08-10 20:34:07 UTC = 14:34:07 en México (UTC−6).
    const texto = fechaHoraSegundosAString(new Date("2026-08-10T20:34:07.000Z"));
    expect(texto).toContain("10/08/2026");
    expect(texto).toContain("34:07");
  });

  it("dos renglones del mismo minuto se distinguen entre sí", () => {
    const a = fechaHoraSegundosAString(new Date("2026-08-10T20:34:07.000Z"));
    const b = fechaHoraSegundosAString(new Date("2026-08-10T20:34:52.000Z"));
    expect(a).not.toBe(b);
  });
});

describe("tiempoRelativo", () => {
  const ahora = new Date("2026-09-05T12:00:00.000Z");
  const hace = (ms: number) => new Date(ahora.getTime() - ms);

  it("elige la unidad según la magnitud", () => {
    expect(tiempoRelativo(hace(30_000), ahora)).toBe("hace un momento");
    expect(tiempoRelativo(hace(5 * 60_000), ahora)).toBe("hace 5 min");
    expect(tiempoRelativo(hace(3 * 3_600_000), ahora)).toBe("hace 3 h");
    expect(tiempoRelativo(hace(86_400_000), ahora)).toBe("ayer");
    expect(tiempoRelativo(hace(5 * 86_400_000), ahora)).toBe("hace 5 días");
    expect(tiempoRelativo(hace(60 * 86_400_000), ahora)).toBe("hace 2 meses");
    expect(tiempoRelativo(hace(400 * 86_400_000), ahora)).toBe("hace 1 año");
  });

  it("no imprime un negativo cuando el timestamp está adelantado", () => {
    // Un reloj desfasado o una fila con fecha futura no debe dar "hace -3 min".
    expect(tiempoRelativo(new Date(ahora.getTime() + 60_000), ahora)).toBe("en el futuro");
  });

  it("59 minutos siguen siendo minutos; 60 ya son horas", () => {
    expect(tiempoRelativo(hace(59 * 60_000), ahora)).toBe("hace 59 min");
    expect(tiempoRelativo(hace(60 * 60_000), ahora)).toBe("hace 1 h");
  });
});
