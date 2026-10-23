import { describe, it, expect } from "vitest";
import { esquemaVenta, esquemaArticuloVenta } from "@/lib/schemas/venta";
import { esquemaDevolucion, esquemaArticuloDevolucion } from "@/lib/schemas/devolucion";

const ARTICULO_CATALOGO = { idCatalogo: 3, nombre: "Aretes", cantidad: 2, precioUnitario: "100.00" };
const ARTICULO_LIBRE = { idCatalogo: null, nombre: "Anillo único", cantidad: 1, precioUnitario: "1500.00" };

// el bug real que motivó estas pruebas — VentaForm/DevolucionForm
// mandan `idCatalogo: null` explícito para un artículo libre (JSON.stringify
// preserva null, no lo omite). `.optional()` solo acepta `undefined`;
// `z.coerce.number()` convierte `null` a 0 y `.positive()` lo rechaza. Sin
// `.nullish()` esto falla en producción con "Invalid input" y nada en tsc
// ni eslint lo detecta — se vio hasta correrlo en el navegador.
describe("esquemaArticuloVenta — idCatalogo null (artículo libre)", () => {
  it("acepta idCatalogo: null", () => {
    expect(esquemaArticuloVenta.safeParse(ARTICULO_LIBRE).success).toBe(true);
  });

  it("acepta idCatalogo ausente (undefined)", () => {
    const sinCampo = { nombre: ARTICULO_LIBRE.nombre, cantidad: ARTICULO_LIBRE.cantidad, precioUnitario: ARTICULO_LIBRE.precioUnitario };
    expect(esquemaArticuloVenta.safeParse(sinCampo).success).toBe(true);
  });

  it("sigue aceptando un idCatalogo vinculado normal", () => {
    expect(esquemaArticuloVenta.safeParse(ARTICULO_CATALOGO).success).toBe(true);
  });

  it("rechaza idCatalogo 0 o negativo cuando sí viene un valor", () => {
    expect(esquemaArticuloVenta.safeParse({ ...ARTICULO_LIBRE, idCatalogo: 0 }).success).toBe(false);
    expect(esquemaArticuloVenta.safeParse({ ...ARTICULO_LIBRE, idCatalogo: -1 }).success).toBe(false);
  });

  it("rechaza nombre vacío incluso siendo artículo libre", () => {
    expect(esquemaArticuloVenta.safeParse({ ...ARTICULO_LIBRE, nombre: "  " }).success).toBe(false);
  });

  it("rechaza precioUnitario inválido", () => {
    expect(esquemaArticuloVenta.safeParse({ ...ARTICULO_LIBRE, precioUnitario: "abc" }).success).toBe(false);
  });
});

describe("esquemaArticuloDevolucion — idCatalogo null", () => {
  it("acepta idCatalogo: null", () => {
    expect(esquemaArticuloDevolucion.safeParse(ARTICULO_LIBRE).success).toBe(true);
  });

  it("acepta idCatalogo ausente", () => {
    const sinCampo = { nombre: ARTICULO_LIBRE.nombre, cantidad: ARTICULO_LIBRE.cantidad, precioUnitario: ARTICULO_LIBRE.precioUnitario };
    expect(esquemaArticuloDevolucion.safeParse(sinCampo).success).toBe(true);
  });
});

describe("esquemaVenta", () => {
  const base = {
    idCliente: 12,
    fecha: "2026-08-10",
    esquemaPago: "Contado" as const,
    tieneEnganche: false,
    articulos: [ARTICULO_LIBRE],
  };

  it("venta de contado válida, mezclando artículo libre y de catálogo", () => {
    const resultado = esquemaVenta.safeParse({ ...base, articulos: [ARTICULO_LIBRE, ARTICULO_CATALOGO] });
    expect(resultado.success).toBe(true);
  });

  it("rechaza una venta sin artículos", () => {
    expect(esquemaVenta.safeParse({ ...base, articulos: [] }).success).toBe(false);
  });

  it("esquemaPago 'Pagos' exige frecuenciaPago", () => {
    const sinFrecuencia = esquemaVenta.safeParse({ ...base, esquemaPago: "Pagos" });
    expect(sinFrecuencia.success).toBe(false);

    const conFrecuencia = esquemaVenta.safeParse({
      ...base,
      esquemaPago: "Pagos",
      frecuenciaPago: "Mensual",
    });
    expect(conFrecuencia.success).toBe(true);
  });

  it("tieneEnganche=true exige un monto de enganche positivo", () => {
    const sinMonto = esquemaVenta.safeParse({ ...base, tieneEnganche: true });
    expect(sinMonto.success).toBe(false);

    const montoCero = esquemaVenta.safeParse({ ...base, tieneEnganche: true, enganche: "0.00" });
    expect(montoCero.success).toBe(false);

    const valido = esquemaVenta.safeParse({ ...base, tieneEnganche: true, enganche: "500.00" });
    expect(valido.success).toBe(true);
  });

  it("rechaza fecha en formato distinto a YYYY-MM-DD", () => {
    expect(esquemaVenta.safeParse({ ...base, fecha: "10/08/2026" }).success).toBe(false);
  });
});

describe("esquemaDevolucion", () => {
  const base = {
    idCliente: 12,
    fecha: "2026-08-10",
    articulos: [ARTICULO_LIBRE],
  };

  it("devolución válida sin motivo (opcional)", () => {
    expect(esquemaDevolucion.safeParse(base).success).toBe(true);
  });

  it("rechaza una devolución sin artículos", () => {
    expect(esquemaDevolucion.safeParse({ ...base, articulos: [] }).success).toBe(false);
  });

  it("acepta motivo cuando se da", () => {
    const resultado = esquemaDevolucion.safeParse({ ...base, motivo: "Talla incorrecta" });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.motivo).toBe("Talla incorrecta");
  });
});

// `precioCredito`: lo que de verdad se le acredita al cliente por pieza
// cuando vuelve con desgaste. Es opcional a propósito — todo llamador
// anterior a la migración 20260905180000 sigue compilando y significando lo
// mismo (acreditar el precio de venta).
describe("esquemaArticuloDevolucion — precioCredito", () => {
  it("acepta que no venga", () => {
    const resultado = esquemaArticuloDevolucion.safeParse(ARTICULO_LIBRE);
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.precioCredito).toBeUndefined();
  });

  it("acepta null explícito (es lo que manda el formulario sin ajuste)", () => {
    const resultado = esquemaArticuloDevolucion.safeParse({
      ...ARTICULO_LIBRE,
      precioCredito: null,
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.precioCredito).toBeNull();
  });

  it("acepta un monto menor al de venta", () => {
    const resultado = esquemaArticuloDevolucion.safeParse({
      ...ARTICULO_LIBRE,
      precioCredito: "1200.00",
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.precioCredito).toBe("1200.00");
  });

  // El campo en blanco de un POST directo NO se interpreta como "sin
  // ajuste": si alguien mandó la clave, el valor tiene que ser un monto.
  it("rechaza la cadena vacía", () => {
    expect(
      esquemaArticuloDevolucion.safeParse({ ...ARTICULO_LIBRE, precioCredito: "" }).success
    ).toBe(false);
  });

  it("rechaza un monto mal formado", () => {
    expect(
      esquemaArticuloDevolucion.safeParse({ ...ARTICULO_LIBRE, precioCredito: "1,200" }).success
    ).toBe(false);
  });

  // El tope contra el precio de venta NO vive aquí: zod ve un artículo a la
  // vez y el mensaje tiene que nombrar la pieza. Lo aplica el servicio (y el
  // CHECK de la base) — ver tests/integration/devoluciones.test.ts.
  it("no es quien rechaza acreditar de más", () => {
    expect(
      esquemaArticuloDevolucion.safeParse({ ...ARTICULO_LIBRE, precioCredito: "99999.00" }).success
    ).toBe(true);
  });
});
