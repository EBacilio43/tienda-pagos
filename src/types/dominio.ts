// DTOs y tipos compartidos entre servidor y cliente. Los campos monetarios
// cruzan la frontera RSC como `string`, nunca `number` (AGENTS.md regla 1).

import type { CambioAuditoria } from "@/lib/auditoria";

// ADR-09: matriz de permisos consulta / operador / admin.
export type Rol = "consulta" | "operador" | "admin";

// DTOs que un Client Component necesita tipar directamente (grids
// editables, formularios) viven aquí, no en server/services/* — ese
// directorio está bloqueado para Client Components por ESLint
// (eslint.config.mjs), incluso para imports de solo tipo.
export type CatalogoItemDTO = {
  id: number;
  nombre: string;
  precio: string;
  descripcion: string | null;
  activo: boolean;
  stock: number;
  stockMinimo: number;
};

// idCatalogo es null para un artículo "libre" (sin vínculo al
// catálogo) — `clave` (ver lib/articulos.ts) es la identidad real que el
// formulario usa para seleccionar/quitar/deduplicar, no idCatalogo.
export type ArticuloDevolubleDTO = {
  clave: string;
  idCatalogo: number | null;
  nombre: string;
  precioUnitario: string;
  cantidadDisponible: number;
};

export type ClienteListaDTO = {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  saldo: string;
  // YYYY-MM-DD (regla 2: nunca un Date cruza la frontera RSC).
  // null = nunca ha abonado, que no es lo mismo que "abonó hace mucho".
  ultimoAbono: string | null;
};

// Una pieza dentro de un movimiento (venta o devolución), tal como la
// muestran el estado de cuenta, el detalle del cliente y el PDF. Vive aquí y
// no en server/services/estado-cuenta.ts —donde se construye— porque
// `DesgloseArticulos` está en src/components/**, que tiene prohibido importar
// de @/server/* aunque sea solo el tipo (regla 6, ESLint la hace inviolable).
//
// `precioUnitario` en null NO es cero: la columna es nullable desde el
// esquema legacy y hay ventas capturadas sin desglosar precio. Se muestra
// como "—", porque $0.00 diría que la pieza se regaló.
export type ArticuloMovimiento = {
  nombre: string;
  cantidad: number;
  precioUnitario: string | null;
  subtotal: string | null;
};

/**
 * Los cuatro estados en que puede estar una cuenta, en el orden en que le
 * importan a quien administra. Son excluyentes y se DERIVAN, no se guardan:
 * la base tiene `activo` y `bloqueado_hasta` por separado, y una cuenta
 * desactivada además bloqueada sigue siendo, en la práctica, una cuenta
 * desactivada. Quien deriva es `listarUsuarios` (server/services/usuarios.ts).
 */
export type EstadoUsuario = "en_linea" | "activo" | "bloqueado" | "desactivado";

// Vive aquí y no en server/services/usuarios.ts por la misma razón que
// ClienteListaDTO: <UsuariosTarjetas> está en src/components/**, y ESLint
// le prohíbe importar de @/server/* aunque sea solo el tipo (regla 6).
export type UsuarioListaDTO = {
  id: number;
  username: string;
  nombreCompleto: string;
  email: string | null;
  rol: string;
  /** `activo` NO va aparte: `estado` ya lo codifica y dos fuentes para el
      mismo hecho terminan diciendo cosas distintas. */
  estado: EstadoUsuario;
  /** Sesiones que de verdad pueden autenticar ahora mismo. */
  sesionesActivas: number;
  ultimoLogin: string | null;
  /** "hace 3 h" del último login, ya resuelto en el servidor (lib/fecha.ts). */
  ultimoLoginRelativo: string | null;
  ultimaActividad: string | null;
  ultimaActividadRelativa: string | null;
  /** Solo si el bloqueo sigue vigente; uno vencido es ruido histórico. */
  bloqueadoHasta: string | null;
  intentosFallidos: number;
  creadoEn: string | null;
};

// Una fila del log de auditoría, ya resuelta a texto por el servicio. Vive
// aquí y no en server/services/auditoria.ts porque <TablaAuditoria> está en
// src/components/** y ESLint le prohíbe importar de @/server/* aunque sea
// solo el tipo (regla 6). `CambioAuditoria` sí vive en lib/auditoria.ts:
// eso es lógica pura, importable desde ambos lados.
export type AuditoriaFilaDTO = {
  id: number;
  /** dd/mm/aaaa hh:mm — el de la columna de la tabla. */
  fecha: string;
  /** Igual, con segundos: dos renglones de una misma transacción comparten minuto. */
  fechaCompleta: string;
  fechaRelativa: string;
  usuarioNombre: string | null;
  usuarioUsername: string | null;
  accion: string;
  accionEtiqueta: string;
  tablaAfectada: string;
  tablaEtiqueta: string;
  registroId: string | null;
  /** Pantalla del registro afectado, o null si no hay ninguna que mostrar. */
  href: string | null;
  ipAddress: string | null;
  cambios: CambioAuditoria[];
};

// ------------------------------------------------------- /admin/sistema

export type TablaSistemaDTO = { nombre: string; filas: number };

/**
 * Una foto instantánea del estado de la instancia. La arma
 * `obtenerSnapshotSistema` (server/services/sistema.ts) y la vuelve a pedir
 * el panel en cada refresco, así que cruza la frontera RSC entera: todos
 * sus campos son números, strings o arreglos de ellos, ningún Date y ningún
 * bigint (los conteos de Postgres llegan como bigint y se convierten en el
 * servicio — un bigint no se serializa a JSON y reventaría el Server Action).
 *
 * Los porcentajes van como `number` y no como string: no son dinero, así
 * que la regla 1 no aplica, y un porcentaje sí se compara contra umbrales.
 */
export type SnapshotSistema = {
  generadoEn: string;
  /** Lo que tardó el propio servidor en juntar todo esto. */
  recoleccionMs: number;

  app: {
    entorno: string;
    versionNode: string;
    plataforma: string;
    uptimeSegundos: number;
    hostname: string;
  };

  proceso: {
    rssBytes: number;
    heapUsadoBytes: number;
    heapTotalBytes: number;
    externoBytes: number;
    /** Ventana corta: una instancia ociosa marca ~0% y eso es correcto. */
    cpuMuestraPct: number;
    /** Promedio desde que arrancó el proceso. */
    cpuPromedioPct: number;
  };

  contenedor: {
    /** "cgroup" = el contenedor; "os" = la máquina entera (respaldo). */
    fuente: "cgroup" | "os";
    memoriaUsadaBytes: number;
    memoriaLimiteBytes: number;
    memoriaPct: number | null;
    /** false = no hay cuota puesta y el "límite" es la RAM de la máquina. */
    memoriaConLimite: boolean;
    nucleos: number;
    nucleosConCuota: boolean;
    cpuMuestraPct: number | null;
    /** De la MÁQUINA: /proc/loadavg no está namespaced por contenedor. */
    cargaPromedio: number[];
  };

  baseDatos: {
    version: string;
    tamanoBytes: number;
    conexionesActivas: number;
    conexionesTotales: number;
    maxConexiones: number | null;
    conexionesPct: number | null;
    arrancadaEn: string | null;
    arrancadaHace: string | null;
    latenciaMinMs: number;
    latenciaMedianaMs: number | null;
    latenciaMaxMs: number;
    latenciaMuestras: number;
    tablas: TablaSistemaDTO[];
  };
};

// El feed de movimientos cruzando todos los clientes. Vive aquí y no en
// server/services/actividad.ts —que lo re-exporta— porque <ListaActividad>
// está en src/components/** y ESLint le prohíbe importar de @/server/*
// aunque sea solo el tipo (regla 6).
export type TipoActividad = "venta" | "enganche" | "pago" | "devolucion";

export type ActividadItemDTO = {
  id: string;
  tipo: TipoActividad;
  /** Ya formateada (regla 2: nunca un Date cruza la frontera RSC). */
  fechaTexto: string;
  clienteId: number;
  clienteNombre: string;
  detalle: string | null;
  monto: string;
};

/**
 * Una celda del calendario de /actividad, con lo que se movió ese día.
 * Cargos y abonos van SEPARADOS a propósito: sumarlos daría un número sin
 * significado — una venta aumenta la deuda y un abono la baja
 * (docs/DOMINIO.md), así que su suma no es "lo que pasó ese día", es la
 * resta de dos cosas distintas.
 */
export type DiaActividadDTO = {
  /** "AAAA-MM-DD" (regla 2: nunca un Date cruza la frontera RSC). */
  fecha: string;
  /** Σ ventas.monto_total — lo que aumentó la deuda. */
  cargos: string;
  /** Σ enganches + pagos + devoluciones — lo que la disminuyó. */
  abonos: string;
  /** Cuántos movimientos, contando el enganche aparte de su venta. */
  movimientos: number;
};
