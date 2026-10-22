// Lectura de las columnas `datos_anteriores` / `datos_nuevos` de la tabla
// `auditoria`. Todo aquí es puro: no toca la base ni React, así que se
// prueba en tests/unit/ y lo pueden usar tanto el servicio (server) como la
// tabla de la pantalla (Client Component) sin cruzar la regla 6.
//
// El formato de esos dos JSON no es un esquema: cada servicio decide qué
// campos escribe (ver `registrarAuditoria`, regla 5), y hay filas de 2026
// junto a filas heredadas del sistema Python. Por eso nada de esto asume
// llaves concretas — se leen las que haya, y las que no se reconocen se
// muestran igual con su nombre crudo, que es mejor que esconderlas.

/** Un valor de auditoría ya aplanado a texto, listo para pintar. */
export type ValorAuditoria = string | null;

export type CambioAuditoria = {
  campo: string;
  /** El nombre en español, o el crudo si no está en el diccionario. */
  etiqueta: string;
  antes: ValorAuditoria;
  despues: ValorAuditoria;
  /** false cuando el campo venía en ambos lados y es idéntico. */
  cambio: boolean;
};

const ETIQUETA_CAMPO: Record<string, string> = {
  activo: "Activa",
  articulos: "Artículos",
  bloqueadoHasta: "Bloqueado hasta",
  calle: "Calle",
  cantidad: "Cantidad",
  clienteId: "Cliente",
  colonia: "Colonia",
  concepto: "Concepto",
  cp: "C.P.",
  delta: "Cambio de stock",
  descripcion: "Descripción",
  email: "Email",
  empresa: "Empresa",
  enganche: "Enganche",
  esquemaPago: "Esquema de pago",
  fecha: "Fecha",
  frecuenciaPago: "Frecuencia de pago",
  idCatalogo: "Artículo del catálogo",
  idCliente: "Cliente",
  idVenta: "Venta",
  metodoPago: "Método de pago",
  monto: "Monto",
  montoCredito: "Monto de crédito",
  montoTotal: "Monto total",
  motivo: "Motivo",
  movimientoId: "Movimiento",
  municipio: "Municipio",
  nombre: "Nombre",
  nombreCompleto: "Nombre completo",
  notas: "Notas",
  numExt: "Núm. ext.",
  numInt: "Núm. int.",
  origen: "Origen",
  precio: "Precio",
  precioCredito: "Precio de crédito",
  precioUnitario: "Precio unitario",
  referencia: "Referencia",
  rol: "Rol",
  saldoQueTenia: "Saldo que tenía",
  stock: "Stock",
  stockMinimo: "Stock mínimo",
  stockResultante: "Stock resultante",
  telefono: "Teléfono",
  tieneEnganche: "Con enganche",
  tipo: "Tipo",
  usuarioId: "Usuario",
  username: "Username",
};

/** "montoTotal" → "Monto total"; "monto_total" → "Monto total". */
export function etiquetaDeCampo(campo: string): string {
  const conocida = ETIQUETA_CAMPO[campo];
  if (conocida) return conocida;
  const palabras = campo
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}

/**
 * Un valor de JSON a texto. Los objetos y arreglos (el caso real:
 * `articulos` de una venta) se resumen en una línea legible en vez de
 * volcarse como JSON crudo — "2× Anillo, 1× Cadena" dice lo que pasó;
 * `[{"nombre":"Anillo","cantidad":2},…]` hay que descifrarlo.
 */
export function valorATexto(valor: unknown): ValorAuditoria {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "string") return valor === "" ? null : valor;

  if (Array.isArray(valor)) {
    if (valor.length === 0) return "(ninguno)";
    return valor.map(resumirElemento).join(", ");
  }

  if (typeof valor === "object") return resumirElemento(valor);
  return String(valor);
}

function resumirElemento(elemento: unknown): string {
  if (elemento === null || typeof elemento !== "object") return String(elemento);

  const obj = elemento as Record<string, unknown>;
  // La forma que de verdad aparece en la auditoría de ventas y
  // devoluciones: { nombre, cantidad, precioUnitario? }.
  if (typeof obj.nombre === "string") {
    const cantidad = typeof obj.cantidad === "number" ? `${obj.cantidad}× ` : "";
    return `${cantidad}${obj.nombre}`;
  }
  return Object.entries(obj)
    .map(([k, v]) => `${etiquetaDeCampo(k)}: ${valorATexto(v) ?? "—"}`)
    .join("; ");
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * El renglón por campo de "qué cambió". El orden lo fija `datosNuevos`
 * (el estado en que quedó el registro, que es lo que se viene a leer), y
 * después se agregan los campos que solo existían antes — típicamente un
 * `eliminar`, donde no hay `datosNuevos` en absoluto.
 *
 * Los campos idénticos en ambos lados NO se descartan: se marcan
 * `cambio: false` para que la pantalla decida si los esconde. Descartarlos
 * aquí haría imposible mostrar el contexto de un `actualizar` que solo
 * tocó un campo de ocho.
 */
export function construirCambios(
  anteriores: unknown,
  nuevos: unknown
): CambioAuditoria[] {
  const antes = esObjetoPlano(anteriores) ? anteriores : {};
  const despues = esObjetoPlano(nuevos) ? nuevos : {};

  const campos = [
    ...Object.keys(despues),
    ...Object.keys(antes).filter((k) => !(k in despues)),
  ];

  return campos.map((campo) => {
    const textoAntes = campo in antes ? valorATexto(antes[campo]) : null;
    const textoDespues = campo in despues ? valorATexto(despues[campo]) : null;
    return {
      campo,
      etiqueta: etiquetaDeCampo(campo),
      antes: textoAntes,
      despues: textoDespues,
      // Un campo que solo existe de un lado siempre cuenta como cambio:
      // `campo in antes` distingue "no venía" de "venía en null".
      cambio: !(campo in antes && campo in despues) || textoAntes !== textoDespues,
    };
  });
}

const ETIQUETA_ACCION: Record<string, string> = {
  actualizar: "Actualizó",
  ajustar_stock: "Ajustó stock",
  cambiar_password: "Cambió su contraseña",
  cerrar_sesion: "Cerró una sesión",
  crear: "Creó",
  eliminar: "Eliminó",
  login: "Inició sesión",
  logout: "Cerró sesión",
  resetear_password: "Reseteó una contraseña",
};

export function etiquetaDeAccion(accion: string): string {
  return ETIQUETA_ACCION[accion] ?? etiquetaDeCampo(accion);
}

// Singular, porque acompaña a un id concreto ("Venta #20"), no a la tabla.
const ETIQUETA_TABLA: Record<string, string> = {
  catalogo: "Artículo",
  clientes: "Cliente",
  devoluciones: "Devolución",
  pagos: "Abono",
  sesiones: "Sesión",
  usuarios: "Usuario",
  ventas: "Venta",
};

export function etiquetaDeTabla(tabla: string): string {
  return ETIQUETA_TABLA[tabla] ?? tabla;
}

// Las pantallas donde se puede ver el registro que la fila tocó. `sesiones`
// queda fuera a propósito: la fila que se cerró ya no existe, y /admin/
// sesiones solo lista las vivas. `catalogo` apunta a la pantalla completa
// porque no hay detalle por artículo.
const RUTA_POR_TABLA: Record<string, (id: string) => string> = {
  catalogo: () => "/catalogo",
  clientes: (id) => `/clientes/${id}`,
  devoluciones: (id) => `/devoluciones/${id}`,
  pagos: (id) => `/pagos/${id}`,
  usuarios: (id) => `/admin/usuarios/${id}/editar`,
  ventas: (id) => `/ventas/${id}`,
};

/**
 * El enlace al registro afectado, o null si no hay pantalla que mostrar.
 * Devuelve null también para una acción `eliminar`: el registro ya no
 * existe y el enlace llevaría a un 404 garantizado.
 */
export function hrefRegistroAuditado(
  tabla: string,
  registroId: string | null,
  accion: string
): string | null {
  if (!registroId || accion === "eliminar") return null;
  const construir = RUTA_POR_TABLA[tabla];
  if (!construir) return null;
  // Solo ids numéricos: los de este esquema lo son, y evita que un valor
  // inesperado en la columna (VarChar(50)) se convierta en parte de una URL.
  if (!/^\d+$/.test(registroId)) return null;
  return construir(registroId);
}
