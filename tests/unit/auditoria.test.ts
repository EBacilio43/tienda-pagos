import { describe, it, expect } from "vitest";
import {
  construirCambios,
  etiquetaDeAccion,
  etiquetaDeCampo,
  etiquetaDeTabla,
  hrefRegistroAuditado,
  valorATexto,
} from "@/lib/auditoria";

// Las columnas `datos_anteriores`/`datos_nuevos` no tienen esquema: cada
// servicio escribe las llaves que le importan (regla 5), y la tabla trae
// filas heredadas del sistema Python junto a las nuevas. Estas pruebas
// fijan que nada de esto asuma una forma concreta — el modo de falla real
// sería una pantalla en blanco o un "[object Object]" delante de un admin
// tratando de reconstruir qué pasó.

describe("valorATexto", () => {
  it("null y string vacío son ausencia, no un valor", () => {
    expect(valorATexto(null)).toBeNull();
    expect(valorATexto(undefined)).toBeNull();
    expect(valorATexto("")).toBeNull();
  });

  it("un booleano se lee en español, no como true/false", () => {
    expect(valorATexto(true)).toBe("Sí");
    expect(valorATexto(false)).toBe("No");
  });

  it("un monto ya viene como string y se deja intacto (regla 1)", () => {
    expect(valorATexto("3000.00")).toBe("3000.00");
  });

  it("el arreglo de artículos de una venta se resume legible", () => {
    const articulos = [
      { nombre: "Anillo", cantidad: 2 },
      { nombre: "Cadena", cantidad: 1 },
    ];
    expect(valorATexto(articulos)).toBe("2× Anillo, 1× Cadena");
  });

  it("un arreglo vacío no se confunde con ausencia", () => {
    expect(valorATexto([])).toBe("(ninguno)");
  });

  it("un objeto sin `nombre` cae al listado campo por campo, no a [object Object]", () => {
    expect(valorATexto({ monto: "50.00", metodoPago: "Efectivo" })).toBe(
      "Monto: 50.00; Método de pago: Efectivo"
    );
  });
});

describe("construirCambios", () => {
  it("un `crear` (solo datosNuevos) lista los valores registrados", () => {
    const cambios = construirCambios(null, { nombre: "Ana", rol: "operador" });
    expect(cambios).toEqual([
      { campo: "nombre", etiqueta: "Nombre", antes: null, despues: "Ana", cambio: true },
      { campo: "rol", etiqueta: "Rol", antes: null, despues: "operador", cambio: true },
    ]);
  });

  it("un `eliminar` (solo datosAnteriores) conserva lo que el registro tenía", () => {
    // La forma exacta que escribe eliminarVenta (services/ventas.ts).
    const cambios = construirCambios({ idCliente: 12, montoTotal: "3000.00" }, null);
    expect(cambios.map((c) => [c.etiqueta, c.antes])).toEqual([
      ["Cliente", "12"],
      ["Monto total", "3000.00"],
    ]);
    expect(cambios.every((c) => c.despues === null)).toBe(true);
  });

  it("marca cuál campo se movió y cuál no, sin descartar los iguales", () => {
    const cambios = construirCambios(
      { monto: "100.00", metodoPago: "Efectivo" },
      { monto: "150.00", metodoPago: "Efectivo" }
    );
    expect(cambios.find((c) => c.campo === "monto")).toMatchObject({
      antes: "100.00",
      despues: "150.00",
      cambio: true,
    });
    // Sin él no se sabría qué NO cambió, que es la mitad de la pregunta.
    expect(cambios.find((c) => c.campo === "metodoPago")).toMatchObject({ cambio: false });
  });

  it("un campo que pasa a null cuenta como cambio, no como campo ausente", () => {
    const cambios = construirCambios({ referencia: "ABC" }, { referencia: null });
    expect(cambios[0]).toMatchObject({ antes: "ABC", despues: null, cambio: true });
  });

  it("un campo que solo existe de un lado siempre es cambio, aunque ambos textos sean null", () => {
    // "no venía la llave" y "venía en null" son distintos, y `in` los separa.
    const cambios = construirCambios({ notas: null }, {});
    expect(cambios[0]).toMatchObject({ campo: "notas", cambio: true });
  });

  it("el orden lo fija datosNuevos y los campos extra de antes van al final", () => {
    const cambios = construirCambios({ viejo: 1, monto: "1.00" }, { monto: "2.00", nuevo: 3 });
    expect(cambios.map((c) => c.campo)).toEqual(["monto", "nuevo", "viejo"]);
  });

  it("un JSON que no es objeto no revienta, devuelve lista vacía", () => {
    expect(construirCambios("texto suelto", 42)).toEqual([]);
    expect(construirCambios(null, null)).toEqual([]);
  });
});

describe("etiquetaDeCampo", () => {
  it("usa el diccionario cuando el campo es conocido", () => {
    expect(etiquetaDeCampo("montoTotal")).toBe("Monto total");
    expect(etiquetaDeCampo("cp")).toBe("C.P.");
  });

  it("un campo desconocido se muestra legible en vez de esconderse", () => {
    expect(etiquetaDeCampo("campoNuevoSinDiccionario")).toBe("Campo nuevo sin diccionario");
    expect(etiquetaDeCampo("campo_heredado")).toBe("Campo heredado");
  });
});

describe("etiquetaDeAccion / etiquetaDeTabla", () => {
  it("traduce las acciones que los servicios escriben hoy", () => {
    expect(etiquetaDeAccion("crear")).toBe("Creó");
    expect(etiquetaDeAccion("resetear_password")).toBe("Reseteó una contraseña");
  });

  it("`logout` está cubierto aunque ningún servicio de src/ lo escriba", () => {
    // 31 filas reales en la base de desarrollo lo tienen (2026-09-05).
    expect(etiquetaDeAccion("logout")).toBe("Cerró sesión");
  });

  it("una acción desconocida cae al formato legible, no al crudo", () => {
    expect(etiquetaDeAccion("accion_futura")).toBe("Accion futura");
  });

  it("la tabla se nombra en singular, porque acompaña a un id", () => {
    expect(etiquetaDeTabla("ventas")).toBe("Venta");
    expect(etiquetaDeTabla("catalogo")).toBe("Artículo");
    expect(etiquetaDeTabla("tabla_que_no_existe")).toBe("tabla_que_no_existe");
  });
});

describe("hrefRegistroAuditado", () => {
  it("enlaza al detalle del registro cuando hay pantalla", () => {
    expect(hrefRegistroAuditado("ventas", "20", "crear")).toBe("/ventas/20");
    expect(hrefRegistroAuditado("pagos", "7", "actualizar")).toBe("/pagos/7");
    expect(hrefRegistroAuditado("clientes", "12", "actualizar")).toBe("/clientes/12");
  });

  it("no enlaza un `eliminar`: el registro ya no existe y sería un 404", () => {
    expect(hrefRegistroAuditado("ventas", "20", "eliminar")).toBeNull();
  });

  it("no enlaza tablas sin pantalla de detalle", () => {
    expect(hrefRegistroAuditado("sesiones", "3", "cerrar_sesion")).toBeNull();
    expect(hrefRegistroAuditado("tabla_desconocida", "1", "crear")).toBeNull();
  });

  it("rechaza un registro_id no numérico en vez de meterlo en una URL", () => {
    // La columna es VarChar(50): nada garantiza que traiga solo dígitos.
    expect(hrefRegistroAuditado("ventas", "../../admin", "crear")).toBeNull();
    expect(hrefRegistroAuditado("ventas", null, "crear")).toBeNull();
  });
});
