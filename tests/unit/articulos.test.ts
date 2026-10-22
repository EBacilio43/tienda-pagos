import { describe, it, expect } from "vitest";
import { claveArticulo } from "@/lib/articulos";

// esta es la identidad que decide si dos líneas de artículo
// son "el mismo artículo" al calcular disponibilidad para devolver — un
// error aquí significa devolver de más o de menos sin que nada lo marque.
describe("claveArticulo", () => {
  it("con idCatalogo, la identidad es el catálogo — nombre/precio no importan", () => {
    const a = claveArticulo({ idCatalogo: 5, nombre: "Aretes", precioUnitario: "100.00" });
    const b = claveArticulo({ idCatalogo: 5, nombre: "otro nombre", precioUnitario: "999.00" });
    expect(a).toBe(b);
  });

  it("catálogos distintos son artículos distintos", () => {
    const a = claveArticulo({ idCatalogo: 5, nombre: "Aretes", precioUnitario: "100.00" });
    const b = claveArticulo({ idCatalogo: 6, nombre: "Aretes", precioUnitario: "100.00" });
    expect(a).not.toBe(b);
  });

  it("sin idCatalogo, mismo nombre+precio = mismo artículo libre", () => {
    const a = claveArticulo({ idCatalogo: null, nombre: "Anillo único", precioUnitario: "1500.00" });
    const b = claveArticulo({ idCatalogo: null, nombre: "Anillo único", precioUnitario: "1500.00" });
    expect(a).toBe(b);
  });

  it("sin idCatalogo, mismo nombre pero precio distinto = artículos distintos", () => {
    const a = claveArticulo({ idCatalogo: null, nombre: "Anillo", precioUnitario: "1500.00" });
    const b = claveArticulo({ idCatalogo: null, nombre: "Anillo", precioUnitario: "1600.00" });
    expect(a).not.toBe(b);
  });

  it("normaliza mayúsculas/espacios en el nombre para no perder el match por un typo de captura", () => {
    const a = claveArticulo({ idCatalogo: null, nombre: "Anillo Rosa", precioUnitario: "100.00" });
    const b = claveArticulo({ idCatalogo: null, nombre: "  anillo rosa  ", precioUnitario: "100.00" });
    expect(a).toBe(b);
  });

  it("un artículo de catálogo y uno libre nunca colisionan, aunque compartan nombre/precio", () => {
    const conCatalogo = claveArticulo({ idCatalogo: 1, nombre: "Aretes", precioUnitario: "100.00" });
    const libre = claveArticulo({ idCatalogo: null, nombre: "Aretes", precioUnitario: "100.00" });
    expect(conCatalogo).not.toBe(libre);
  });

  it("idCatalogo undefined se trata igual que null", () => {
    const a = claveArticulo({ nombre: "X", precioUnitario: "1.00" });
    const b = claveArticulo({ idCatalogo: null, nombre: "X", precioUnitario: "1.00" });
    expect(a).toBe(b);
  });
});
