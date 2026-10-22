import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

type ClienteTransaccional = PrismaClient | Prisma.TransactionClient;
import { obtenerSaldo, obtenerSaldos } from "./saldo";
// El desglose por pieza lo arma el ledger y estas dos listas muestran los
// mismos movimientos: reusarlo es lo que evita que la pantalla de ventas y
// el estado de cuenta digan precios distintos de la misma pieza.
import { desglosar, type ArticuloMovimiento } from "./estado-cuenta";
import { decimalAString } from "@/lib/money";
import { fechaAString } from "@/lib/fecha";
import { registrarAuditoria } from "@/server/audit/registrar";
import { ajustarStockTx } from "./stock";
import { puedeCrearEditarClientes, puedeEliminarClientes, ErrorPermiso } from "@/lib/permisos";
import { ErrorDominio } from "@/lib/errores";
import { normalizarNombre, type DatosCliente } from "@/lib/schemas/cliente";
import type { ClienteListaDTO, Rol } from "@/types/dominio";

export type { ClienteListaDTO };
export type ActorAuditoria = { id: number; rol: Rol };

export type ClienteListaResultado = {
  clientes: ClienteListaDTO[];
  total: number;
};

const POR_PAGINA = 20;

// Búsqueda y paginación server-side (el legacy carga todo con
// rowsPerPage: 0, gui.py:1309).
export async function listarClientes(params: {
  busqueda?: string;
  pagina?: number;
}): Promise<ClienteListaResultado> {
  const pagina = Math.max(1, params.pagina ?? 1);
  const where: Prisma.ClienteWhereInput = params.busqueda?.trim()
    ? { nombre: { contains: params.busqueda.trim(), mode: "insensitive" } }
    : {};

  const [total, clientes] = await Promise.all([
    prisma.cliente.count({ where }),
    prisma.cliente.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        telefono: true,
        email: true,
      },
      orderBy: { nombre: "asc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) {
    return { total, clientes: [] };
  }

  // Un groupBy para toda la página, no una consulta por cliente — el mismo
  // patrón que dashboard.ts. El costo es constante: paginar de 20 en 20 no
  // se vuelve 20 viajes a la base.
  const [saldos, ultimosAbonos] = await Promise.all([
    obtenerSaldos(ids),
    prisma.pago.groupBy({
      by: ["idCliente"],
      _max: { fecha: true },
      where: { idCliente: { in: ids } },
    }),
  ]);

  const ultimoAbonoPorCliente = new Map(
    ultimosAbonos
      .filter((u) => u._max.fecha !== null)
      .map((u) => [u.idCliente, u._max.fecha as Date])
  );

  return {
    total,
    clientes: clientes.map((c) => {
      const ultimo = ultimoAbonoPorCliente.get(c.id);
      return {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        email: c.email,
        saldo: decimalAString(saldos.get(c.id) ?? new Prisma.Decimal(0)),
        ultimoAbono: ultimo ? fechaAString(ultimo) : null,
      };
    }),
  };
}

export { POR_PAGINA as CLIENTES_POR_PAGINA };

export type ClienteSelectorDTO = { id: number; nombre: string };

// Para selectores/pickers (registro rápido de actividad) — sin paginar a
// propósito: el negocio tiene decenas de clientes, no miles, y un picker
// necesita la lista completa para buscar client-side. Si `listarClientes`
// (paginado, con saldo) algún día no alcanza para esto, no es este caso.
export async function listarClientesParaSelector(): Promise<ClienteSelectorDTO[]> {
  return prisma.cliente.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

export type ClienteDetalleDTO = {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  empresa: string | null;
  calle: string | null;
  numExt: string | null;
  numInt: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  cp: string | null;
  fechaRegistro: string | null;
  saldo: string;
};

export async function obtenerClienteDetalle(id: number): Promise<ClienteDetalleDTO | null> {
  // Paralelizar la lectura del cliente con el saldo calculado en la vista SQL
  // para evitar round-trips secuenciales hacia la BD.
  const [cliente, saldo] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        email: true,
        telefono: true,
        empresa: true,
        calle: true,
        numExt: true,
        numInt: true,
        colonia: true,
        municipio: true,
        estado: true,
        cp: true,
        fechaRegistro: true,
      },
    }),
    obtenerSaldo(id),
  ]);
  if (!cliente) return null;

  return {
    id: cliente.id,
    nombre: cliente.nombre,
    email: cliente.email,
    telefono: cliente.telefono,
    empresa: cliente.empresa,
    calle: cliente.calle,
    numExt: cliente.numExt,
    numInt: cliente.numInt,
    colonia: cliente.colonia,
    municipio: cliente.municipio,
    estado: cliente.estado,
    cp: cliente.cp,
    fechaRegistro: cliente.fechaRegistro ? fechaAString(cliente.fechaRegistro) : null,
    saldo: decimalAString(saldo),
  };
}

export type VentaClienteDTO = {
  id: number;
  fecha: string;
  esquemaPago: string | null;
  frecuenciaPago: string | null;
  montoTotal: string;
  tieneEnganche: boolean;
  enganche: string | null;
  articulos: ArticuloMovimiento[];
};

export async function listarVentasCliente(clienteId: number): Promise<VentaClienteDTO[]> {
  const ventas = await prisma.venta.findMany({
    where: { idCliente: clienteId },
    select: {
      id: true,
      fecha: true,
      esquemaPago: true,
      frecuenciaPago: true,
      montoTotal: true,
      tieneEnganche: true,
      enganche: true,
      ventaArticulos: {
        select: {
          nombre: true,
          cantidad: true,
          precioUnitario: true,
        },
      },
    },
    orderBy: { fecha: "desc" },
  });
  return ventas.map((v) => ({
    id: v.id,
    fecha: fechaAString(v.fecha),
    esquemaPago: v.esquemaPago,
    frecuenciaPago: v.frecuenciaPago,
    montoTotal: decimalAString(v.montoTotal ?? new Prisma.Decimal(0)),
    tieneEnganche: v.tieneEnganche ?? false,
    enganche: v.enganche ? decimalAString(v.enganche) : null,
    articulos: desglosar(v.ventaArticulos),
  }));
}

export type PagoClienteDTO = {
  id: number;
  fecha: string;
  monto: string;
  metodoPago: string | null;
  referencia: string | null;
  notas: string | null;
};

export async function listarPagosCliente(clienteId: number): Promise<PagoClienteDTO[]> {
  const pagos = await prisma.pago.findMany({
    where: { idCliente: clienteId },
    select: {
      id: true,
      fecha: true,
      monto: true,
      metodoPago: true,
      referencia: true,
      notas: true,
    },
    orderBy: { fecha: "desc" },
  });
  return pagos.map((p) => ({
    id: p.id,
    fecha: fechaAString(p.fecha),
    monto: decimalAString(p.monto),
    metodoPago: p.metodoPago,
    referencia: p.referencia,
    notas: p.notas,
  }));
}

export type DevolucionClienteDTO = {
  id: number;
  fecha: string;
  motivo: string | null;
  montoCredito: string;
  articulos: ArticuloMovimiento[];
};

export async function listarDevolucionesCliente(
  clienteId: number
): Promise<DevolucionClienteDTO[]> {
  const devoluciones = await prisma.devolucion.findMany({
    where: { idCliente: clienteId },
    select: {
      id: true,
      fecha: true,
      motivo: true,
      montoCredito: true,
      devolucionArticulos: {
        select: {
          nombre: true,
          cantidad: true,
          precioUnitario: true,
          precioCredito: true,
        },
      },
    },
    orderBy: { fecha: "desc" },
  });
  return devoluciones.map((d) => ({
    id: d.id,
    fecha: fechaAString(d.fecha),
    motivo: d.motivo,
    montoCredito: decimalAString(d.montoCredito),
    articulos: desglosar(
      d.devolucionArticulos.map((a) => ({ ...a, precioUnitario: a.precioCredito ?? a.precioUnitario }))
    ),
  }));
}

function datosParaAuditoria(datos: DatosCliente) {
  return {
    nombre: datos.nombre,
    email: datos.email ?? null,
    telefono: datos.telefono ?? null,
    empresa: datos.empresa ?? null,
    calle: datos.calle ?? null,
    numExt: datos.numExt ?? null,
    numInt: datos.numInt ?? null,
    colonia: datos.colonia ?? null,
    municipio: datos.municipio ?? null,
    estado: datos.estado ?? null,
    cp: datos.cp ?? null,
  };
}

// `clientes.nombre` tiene restricción de unicidad (@@unique([nombre])).
// El chequeo previo y la captura de P2002 garantizan mensajes claros de ErrorDominio
// tanto en ejecuciones secuenciales como concurrentes.
export async function crearCliente(
  actor: ActorAuditoria,
  datos: DatosCliente
): Promise<{ id: number }> {
  if (!puedeCrearEditarClientes(actor.rol)) throw new ErrorPermiso();

  const datosNormalizados = {
    ...datos,
    nombre: normalizarNombre(datos.nombre),
  };

  try {
    return await prisma.$transaction(async (tx) => {
      const duplicado = await tx.cliente.findFirst({
        where: { nombre: datosNormalizados.nombre },
      });
      if (duplicado) {
        throw new ErrorDominio(`Ya existe un cliente con el nombre "${datosNormalizados.nombre}"`);
      }

      const cliente = await tx.cliente.create({
        data: { ...datosParaAuditoria(datosNormalizados), fechaRegistro: new Date() },
      });

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "crear",
        tablaAfectada: "clientes",
        registroId: String(cliente.id),
        datosNuevos: datosParaAuditoria(datosNormalizados),
      });

      return { id: cliente.id };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ErrorDominio(`Ya existe un cliente con el nombre "${datosNormalizados.nombre}"`);
    }
    throw err;
  }
}

export async function actualizarCliente(
  actor: ActorAuditoria,
  id: number,
  datos: DatosCliente
): Promise<void> {
  if (!puedeCrearEditarClientes(actor.rol)) throw new ErrorPermiso();

  const datosNormalizados = {
    ...datos,
    nombre: normalizarNombre(datos.nombre),
  };

  try {
    await prisma.$transaction(async (tx) => {
      const anterior = await tx.cliente.findUniqueOrThrow({ where: { id } });

      const duplicado = await tx.cliente.findFirst({
        where: { nombre: datosNormalizados.nombre, id: { not: id } },
      });
      if (duplicado) {
        throw new ErrorDominio(`Ya existe otro cliente con el nombre "${datosNormalizados.nombre}"`);
      }

      await tx.cliente.update({ where: { id }, data: datosParaAuditoria(datosNormalizados) });

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "actualizar",
        tablaAfectada: "clientes",
        registroId: String(id),
        datosAnteriores: {
          nombre: anterior.nombre,
          email: anterior.email,
          telefono: anterior.telefono,
          empresa: anterior.empresa,
          calle: anterior.calle,
          numExt: anterior.numExt,
          numInt: anterior.numInt,
          colonia: anterior.colonia,
          municipio: anterior.municipio,
          estado: anterior.estado,
          cp: anterior.cp,
        },
        datosNuevos: datosParaAuditoria(datosNormalizados),
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ErrorDominio(`Ya existe otro cliente con el nombre "${datosNormalizados.nombre}"`);
    }
    throw err;
  }
}

export async function eliminarCliente(actor: ActorAuditoria, id: number): Promise<void> {
  if (!puedeEliminarClientes(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUniqueOrThrow({ where: { id } });

    try {
      await tx.cliente.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        throw new ErrorDominio(
          `No se puede eliminar a "${cliente.nombre}": tiene ventas, pagos, devoluciones o herencias de cuenta asociadas.`
        );
      }
      throw err;
    }

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "eliminar",
      tablaAfectada: "clientes",
      registroId: String(id),
      datosAnteriores: { nombre: cliente.nombre },
    });
  });
}

export type ResultadoBorrado = {
  clienteId: number;
  nombre: string;
  ventas: number;
  pagos: number;
  devoluciones: number;
  saldoQueTenia: string;
};

/**
 * Borra un cliente **con toda su cuenta**: ventas, abonos y devoluciones.
 *
 * `eliminarCliente` a secas no puede hacer esto y es correcto que no pueda —
 * las FK de `ventas`/`pagos`/`devoluciones` hacia `clientes` son `NO ACTION`,
 * así que la base rechaza borrar a alguien con movimientos y el servicio lo
 * traduce a un mensaje. Esa red existe para que nadie vacíe una cuenta con un
 * clic. Esto es la puerta explícita para cuando sí se quiere: la migración de
 * las libretas de papel, donde el registro capturado a mano se reemplaza por
 * el transcrito.
 *
 * **Una transacción por cliente, no por renglón**, por la misma razón que
 * `cargarCuentaDeLibreta`: media cuenta borrada deja un saldo que parece real
 * y es falso. O se va entera o no se va.
 *
 * **Regla 5**: un renglón de auditoría por registro borrado, con su
 * `registro_id` real y sus datos anteriores — es lo único que queda de esas
 * filas después. **Regla 4**: el stock de un artículo vinculado al catálogo
 * se revierte por `ajustarStockTx`, igual que en `eliminarVenta` y
 * `eliminarDevolucion`; hoy no hay ninguno vinculado, pero el día que lo haya
 * este camino no puede ser el que rompa la invariante.
 */
export async function eliminarCuentaCompleta(
  actor: ActorAuditoria,
  id: number
): Promise<ResultadoBorrado> {
  if (!puedeEliminarClientes(actor.rol)) throw new ErrorPermiso();

  // Fuera de la transacción a propósito: es el saldo que la cuenta tenía
  // justo antes, y se guarda en la auditoría del cliente para que quede en
  // algún lado cuánto se estaba borrando.
  const saldoQueTenia = decimalAString(await obtenerSaldo(id));

  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({
      where: { id },
      select: { id: true, nombre: true },
    });
    if (!cliente) {
      throw new ErrorDominio(`No existe un cliente con id ${id}.`);
    }

    const [ventas, pagos, devoluciones] = await Promise.all([
      tx.venta.findMany({
        where: { idCliente: id },
        include: { ventaArticulos: true },
      }),
      tx.pago.findMany({ where: { idCliente: id } }),
      tx.devolucion.findMany({
        where: { idCliente: id },
        include: { devolucionArticulos: true },
      }),
    ]);

    for (const pago of pagos) {
      await tx.pago.delete({ where: { id: pago.id } });
      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "eliminar",
        tablaAfectada: "pagos",
        registroId: String(pago.id),
        datosAnteriores: {
          idCliente: id,
          fecha: fechaAString(pago.fecha),
          monto: decimalAString(pago.monto),
          origen: ORIGEN_BORRADO,
        },
      });
    }

    for (const devolucion of devoluciones) {
      for (const articulo of devolucion.devolucionArticulos) {
        if (articulo.idCatalogo) {
          await ajustarStockTx(tx, actor, {
            idCatalogo: articulo.idCatalogo,
            delta: -(articulo.cantidad ?? 0),
            tipo: "baja_devolucion",
            referenciaTipo: "devolucion",
            referenciaId: devolucion.id,
            notas: "Reversión por borrado de la cuenta completa",
          });
        }
      }
      // devolucion_articulos tiene onDelete: Cascade.
      await tx.devolucion.delete({ where: { id: devolucion.id } });
      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "eliminar",
        tablaAfectada: "devoluciones",
        registroId: String(devolucion.id),
        datosAnteriores: {
          idCliente: id,
          fecha: fechaAString(devolucion.fecha),
          montoCredito: decimalAString(devolucion.montoCredito),
          origen: ORIGEN_BORRADO,
        },
      });
    }

    for (const venta of ventas) {
      for (const articulo of venta.ventaArticulos) {
        if (articulo.idCatalogo) {
          await ajustarStockTx(tx, actor, {
            idCatalogo: articulo.idCatalogo,
            delta: articulo.cantidad ?? 0,
            tipo: "baja_venta",
            referenciaTipo: "venta",
            referenciaId: venta.id,
            notas: "Reversión por borrado de la cuenta completa",
          });
        }
      }
      // venta_articulos tiene onDelete: Cascade.
      await tx.venta.delete({ where: { id: venta.id } });
      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "eliminar",
        tablaAfectada: "ventas",
        registroId: String(venta.id),
        datosAnteriores: {
          idCliente: id,
          fecha: fechaAString(venta.fecha),
          montoTotal: venta.montoTotal ? decimalAString(venta.montoTotal) : null,
          articulos: venta.ventaArticulos.length,
          origen: ORIGEN_BORRADO,
        },
      });
    }

    try {
      await tx.cliente.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        // Ya no son movimientos: queda una herencia de cuenta o una absorción
        // apuntándole. Eso es una relación con OTRO cliente y borrarla en
        // silencio se llevaría contexto de una cuenta que nadie pidió tocar.
        throw new ErrorDominio(
          `No se puede eliminar a "${cliente.nombre}": tiene una herencia de ` +
            `cuenta o una absorción de otro cliente apuntándole. Resuélvela primero.`
        );
      }
      throw err;
    }

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "eliminar",
      tablaAfectada: "clientes",
      registroId: String(id),
      datosAnteriores: {
        nombre: cliente.nombre,
        saldoQueTenia,
        ventas: ventas.length,
        pagos: pagos.length,
        devoluciones: devoluciones.length,
        origen: ORIGEN_BORRADO,
      },
    });

    return {
      clienteId: id,
      nombre: cliente.nombre,
      ventas: ventas.length,
      pagos: pagos.length,
      devoluciones: devoluciones.length,
      saldoQueTenia,
    };
  });
}

/**
 * Queda en la auditoría para poder distinguir después un borrado de cuenta
 * completa de la eliminación suelta de un movimiento. Hermano de
 * `carga_libreta` en `services/libretas.ts`: si mañana falta una cuenta, la
 * primera pregunta es si se fue por aquí.
 */
const ORIGEN_BORRADO = "borrado_cuenta_completa";

export const LIMITE_SALTOS_ABSORCION = 10;

/**
 * Valida que asignar `nuevoAbsorbidoPor` al cliente `clienteId` no introduzca
 * un ciclo directo (largo 1) o indirecto (largo >= 2), ni exceda el límite
 * defensivo de 10 saltos jerárquicos ().
 *
 * Lanza ErrorDominio si se detecta un ciclo, si el cliente absorbente no
 * existe o si la cadena supera los 10 saltos.
 */
export async function validarSinCiclosAbsorcion(
  clienteId: number,
  nuevoAbsorbidoPor: number | null,
  tx: ClienteTransaccional = prisma
): Promise<void> {
  if (nuevoAbsorbidoPor === null || nuevoAbsorbidoPor === undefined) {
    return;
  }

  if (clienteId === nuevoAbsorbidoPor) {
    throw new ErrorDominio(
      `Un cliente no puede ser absorbido por sí mismo (cliente ${clienteId}).`
    );
  }

  const visitados = new Set<number>([clienteId]);
  let actualId: number | null = nuevoAbsorbidoPor;
  let saltos = 0;

  while (actualId !== null) {
    if (visitados.has(actualId)) {
      throw new ErrorDominio(
        `Se detectó un ciclo en la cadena de absorción: el cliente ${actualId} ya forma parte del linaje.`
      );
    }

    if (saltos >= LIMITE_SALTOS_ABSORCION) {
      throw new ErrorDominio(
        `La cadena de absorción supera el límite de ${LIMITE_SALTOS_ABSORCION} saltos permitidos.`
      );
    }

    visitados.add(actualId);
    saltos++;

    const cliente: { id: number; absorbidoPor: number | null } | null =
      await tx.cliente.findUnique({
        where: { id: actualId },
        select: { id: true, absorbidoPor: true },
      });

    if (!cliente) {
      throw new ErrorDominio(
        `El cliente absorbente con id ${actualId} no existe.`
      );
    }

    actualId = cliente.absorbidoPor;
  }
}
