import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { registrarAuditoria } from "@/server/audit/registrar";
import { ajustarStockTx } from "./stock";
import { obtenerRegistroDeAuditoria, type RegistroAuditoriaDTO } from "./auditoria";
import { decimalAString, multiplicarMonto, formatearMoneda } from "@/lib/money";
import { claveArticulo } from "@/lib/articulos";
import { puedeGestionarTransacciones, ErrorPermiso } from "@/lib/permisos";
import { ErrorDominio } from "@/lib/errores";
import type { DatosDevolucion } from "@/lib/schemas/devolucion";
import type { ArticuloDevolubleDTO, Rol } from "@/types/dominio";
import { registrarIdempotenciaTx } from "./idempotencia";

export type { ArticuloDevolubleDTO };
export type ActorAuditoria = { id: number; rol: Rol };
type ClienteTransaccional = PrismaClient | Prisma.TransactionClient;

type Devoluble = { idCatalogo: number | null; nombre: string; precioUnitario: string; cantidad: number };

// Disponible para devolver = Σ vendido − Σ ya devuelto, en todo el
// historial del cliente (mismo criterio que gui.py:_get_purchased_products).
// ya no exige `idCatalogo` — se agrupa por `claveArticulo`
// (catálogo cuando hay vínculo, nombre+precio cuando el artículo es
// "libre") para que las piezas únicas capturadas a mano también se puedan
// devolver, no solo las vinculadas al catálogo.
// `excluirDevolucionId` se usa al editar: sin esto, la propia devolución
// que se está editando se restaría de su propia disponibilidad.
async function calcularDevolubles(
  db: ClienteTransaccional,
  clienteId: number,
  excluirDevolucionId?: number
): Promise<Map<string, Devoluble>> {
  const [ventaArticulos, devolucionArticulos] = await Promise.all([
    db.ventaArticulo.findMany({
      where: { venta: { idCliente: clienteId } },
      select: { idCatalogo: true, nombre: true, cantidad: true, precioUnitario: true },
    }),
    db.devolucionArticulo.findMany({
      where: {
        devolucion: {
          idCliente: clienteId,
          ...(excluirDevolucionId ? { id: { not: excluirDevolucionId } } : {}),
        },
      },
      select: { idCatalogo: true, nombre: true, precioUnitario: true, cantidad: true },
    }),
  ]);

  const disponible = new Map<string, Devoluble>();
  for (const va of ventaArticulos) {
    const precioUnitario = va.precioUnitario ? decimalAString(va.precioUnitario) : "0.00";
    const clave = claveArticulo({ idCatalogo: va.idCatalogo, nombre: va.nombre, precioUnitario });
    const actual = disponible.get(clave);
    disponible.set(clave, {
      idCatalogo: va.idCatalogo,
      nombre: va.nombre,
      precioUnitario,
      cantidad: (actual?.cantidad ?? 0) + (va.cantidad ?? 0),
    });
  }
  for (const da of devolucionArticulos) {
    const precioUnitario = da.precioUnitario ? decimalAString(da.precioUnitario) : "0.00";
    const clave = claveArticulo({ idCatalogo: da.idCatalogo, nombre: da.nombre, precioUnitario });
    const actual = disponible.get(clave);
    if (actual) actual.cantidad -= da.cantidad ?? 0;
  }
  return disponible;
}

export async function obtenerArticulosDevolubles(
  clienteId: number
): Promise<ArticuloDevolubleDTO[]> {
  const mapa = await calcularDevolubles(prisma, clienteId);
  return Array.from(mapa.entries())
    .filter(([, v]) => v.cantidad > 0)
    .map(([clave, v]) => ({
      clave,
      idCatalogo: v.idCatalogo,
      nombre: v.nombre,
      precioUnitario: v.precioUnitario,
      cantidadDisponible: v.cantidad,
    }));
}

export type DevolucionParaEditarDTO = {
  id: number;
  idCliente: number;
  fecha: string;
  motivo: string | null;
  articulos: {
    idCatalogo: number | null;
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    precioCredito: string | null;
  }[];
};

export async function obtenerDevolucionParaEditar(
  id: number
): Promise<DevolucionParaEditarDTO | null> {
  const devolucion = await prisma.devolucion.findUnique({
    where: { id },
    select: {
      id: true,
      idCliente: true,
      fecha: true,
      motivo: true,
      devolucionArticulos: {
        select: {
          idCatalogo: true,
          nombre: true,
          cantidad: true,
          precioUnitario: true,
          precioCredito: true,
        },
      },
    },
  });
  if (!devolucion) return null;

  return {
    id: devolucion.id,
    idCliente: devolucion.idCliente,
    fecha: devolucion.fecha.toISOString().slice(0, 10),
    motivo: devolucion.motivo,
    // ya no se filtran los artículos sin idCatalogo.
    articulos: devolucion.devolucionArticulos.map((a) => ({
      idCatalogo: a.idCatalogo,
      nombre: a.nombre,
      cantidad: a.cantidad ?? 0,
      precioUnitario: a.precioUnitario ? decimalAString(a.precioUnitario) : "0.00",
      precioCredito: a.precioCredito ? decimalAString(a.precioCredito) : null,
    })),
  };
}

export type DevolucionDetalleDTO = {
  id: number;
  clienteId: number;
  clienteNombre: string;
  fecha: string;
  motivo: string | null;
  montoCredito: string;
  articulos: {
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    precioCredito: string | null;
    subtotal: string;
  }[];
  registro: RegistroAuditoriaDTO;
};

export async function obtenerDevolucionDetalle(id: number): Promise<DevolucionDetalleDTO | null> {
  const [devolucion, registro] = await Promise.all([
    prisma.devolucion.findUnique({
      where: { id },
      select: {
        id: true,
        idCliente: true,
        fecha: true,
        motivo: true,
        montoCredito: true,
        cliente: { select: { nombre: true } },
        devolucionArticulos: {
          select: {
            nombre: true,
            cantidad: true,
            precioUnitario: true,
            precioCredito: true,
          },
        },
      },
    }),
    obtenerRegistroDeAuditoria("devoluciones", id),
  ]);
  if (!devolucion) return null;

  return {
    id: devolucion.id,
    clienteId: devolucion.idCliente,
    clienteNombre: devolucion.cliente.nombre,
    fecha: devolucion.fecha.toISOString().slice(0, 10),
    motivo: devolucion.motivo,
    montoCredito: decimalAString(devolucion.montoCredito),
    articulos: devolucion.devolucionArticulos.map((a) => {
      const cantidad = a.cantidad ?? 0;
      const precioUnitario = a.precioUnitario ? decimalAString(a.precioUnitario) : "0.00";
      const precioCredito = a.precioCredito ? decimalAString(a.precioCredito) : null;
      return {
        nombre: a.nombre,
        cantidad,
        precioUnitario,
        precioCredito,
        // El subtotal es lo ACREDITADO, no lo vendido: es el renglón que
        // suma hacia `montoCredito`, y un desglose que no suma su propio
        // total es peor que no tenerlo.
        subtotal: multiplicarMonto(precioCredito ?? precioUnitario, cantidad),
      };
    }),
    registro,
  };
}

// `precioCredito ?? precioUnitario`: una devolución se acredita al precio de
// venta salvo que se haya capturado uno menor (la pieza vuelve con desgaste
// de uso). docs/DOMINIO.md sigue vigente en lo que importa — monto_credito se
// DERIVA de los artículos, nunca se recibe suelto del formulario.
function calcularMontoCredito(
  articulos: readonly { cantidad: number; precioUnitario: string; precioCredito?: string | null }[]
): Prisma.Decimal {
  return articulos.reduce(
    (acc, a) => acc.plus(new Prisma.Decimal(a.precioCredito ?? a.precioUnitario).times(a.cantidad)),
    new Prisma.Decimal(0)
  );
}

// Acreditar más de lo que la pieza costó regala saldo. El modo de falla real
// no es alguien haciéndolo a propósito: es el error de dedo —25000 donde iba
// 2500— que le baja el saldo al cliente por una cifra que nadie autorizó y no
// avisa. La base tiene el mismo tope como segunda red independiente
// (migración 20260905180000), pero el mensaje útil, con el nombre de la
// pieza, solo se puede armar aquí.
function validarPreciosCredito(articulos: DatosDevolucion["articulos"]): void {
  for (const a of articulos) {
    if (!a.precioCredito) continue;
    if (new Prisma.Decimal(a.precioCredito).greaterThan(a.precioUnitario)) {
      throw new ErrorDominio(
        `No se puede acreditar más de ${formatearMoneda(a.precioUnitario)} por "${a.nombre}" — es el precio al que se vendió.`
      );
    }
  }
}

async function validarContraDevolubles(
  tx: Prisma.TransactionClient,
  clienteId: number,
  articulos: DatosDevolucion["articulos"],
  excluirDevolucionId?: number
): Promise<void> {
  const devolubles = await calcularDevolubles(tx, clienteId, excluirDevolucionId);

  const pedido = new Map<string, number>();
  for (const articulo of articulos) {
    const clave = claveArticulo(articulo);
    pedido.set(clave, (pedido.get(clave) ?? 0) + articulo.cantidad);
  }

  for (const [clave, cantidadPedida] of pedido) {
    const disponible = devolubles.get(clave)?.cantidad ?? 0;
    if (cantidadPedida > disponible) {
      const nombre = devolubles.get(clave)?.nombre ?? "artículo";
      throw new ErrorDominio(
        `No se puede devolver ${cantidadPedida} de "${nombre}" — disponible: ${disponible}.`
      );
    }
  }
}

function datosParaAuditoria(datos: DatosDevolucion, montoCredito: Prisma.Decimal) {
  return {
    idCliente: datos.idCliente,
    fecha: datos.fecha,
    motivo: datos.motivo ?? null,
    montoCredito: montoCredito.toFixed(2),
    articulos: datos.articulos,
  };
}

// El servicio es el gate real (AGENTS.md regla 7): un POST directo al
// Action con cantidades imposibles se rechaza aquí, no solo en la UI —
// a diferencia del legacy (gui.py:1137-1143, la validación solo vive ahí).
export async function crearDevolucion(
  actor: ActorAuditoria,
  datos: DatosDevolucion,
  token?: string
): Promise<{ id: number }> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  validarPreciosCredito(datos.articulos);

  return prisma.$transaction(async (tx) => {
    await registrarIdempotenciaTx(tx, token, "crearDevolucion");

    await validarContraDevolubles(tx, datos.idCliente, datos.articulos);

    const montoCredito = calcularMontoCredito(datos.articulos);

    const devolucion = await tx.devolucion.create({
      data: {
        idCliente: datos.idCliente,
        fecha: new Date(`${datos.fecha}T00:00:00Z`),
        motivo: datos.motivo,
        montoCredito: montoCredito.toFixed(2),
        fechaRegistroSistema: new Date(),
        devolucionArticulos: {
          create: datos.articulos.map((a) => ({
            idCatalogo: a.idCatalogo ?? null,
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnitario: a.precioUnitario,
            precioCredito: a.precioCredito ?? null,
          })),
        },
      },
    });

    // un artículo sin idCatalogo no tiene stock que reponer.
    for (const articulo of datos.articulos) {
      if (!articulo.idCatalogo) continue;
      await ajustarStockTx(tx, actor, {
        idCatalogo: articulo.idCatalogo,
        delta: articulo.cantidad,
        tipo: "devolucion",
        referenciaTipo: "devolucion",
        referenciaId: devolucion.id,
      });
    }

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "crear",
      tablaAfectada: "devoluciones",
      registroId: String(devolucion.id),
      datosNuevos: datosParaAuditoria(datos, montoCredito),
    });

    return { id: devolucion.id };
  });
}

export async function actualizarDevolucion(
  actor: ActorAuditoria,
  id: number,
  datos: DatosDevolucion
): Promise<void> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  validarPreciosCredito(datos.articulos);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.devolucion.findUniqueOrThrow({
      where: { id },
      include: { devolucionArticulos: true },
    });

    await validarContraDevolubles(tx, datos.idCliente, datos.articulos, id);

    // Revertir el stock que había repuesto la devolución anterior.
    for (const previo of anterior.devolucionArticulos) {
      if (previo.idCatalogo) {
        await ajustarStockTx(tx, actor, {
          idCatalogo: previo.idCatalogo,
          delta: -(previo.cantidad ?? 0),
          tipo: "edicion_devolucion_reversion",
          referenciaTipo: "devolucion",
          referenciaId: id,
          notas: "Reversión por edición de devolución",
        });
      }
    }

    await tx.devolucionArticulo.deleteMany({ where: { idDevolucion: id } });

    const montoCredito = calcularMontoCredito(datos.articulos);

    await tx.devolucion.update({
      where: { id },
      data: {
        idCliente: datos.idCliente,
        fecha: new Date(`${datos.fecha}T00:00:00Z`),
        motivo: datos.motivo,
        montoCredito: montoCredito.toFixed(2),
        devolucionArticulos: {
          create: datos.articulos.map((a) => ({
            idCatalogo: a.idCatalogo ?? null,
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnitario: a.precioUnitario,
            precioCredito: a.precioCredito ?? null,
          })),
        },
      },
    });

    for (const articulo of datos.articulos) {
      if (!articulo.idCatalogo) continue;
      await ajustarStockTx(tx, actor, {
        idCatalogo: articulo.idCatalogo,
        delta: articulo.cantidad,
        tipo: "edicion_devolucion",
        referenciaTipo: "devolucion",
        referenciaId: id,
      });
    }

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "actualizar",
      tablaAfectada: "devoluciones",
      registroId: String(id),
      datosAnteriores: {
        montoCredito: decimalAString(anterior.montoCredito),
        articulos: anterior.devolucionArticulos.map((a) => ({
          nombre: a.nombre,
          cantidad: a.cantidad,
          precioCredito: a.precioCredito ? decimalAString(a.precioCredito) : null,
        })),
      },
      datosNuevos: datosParaAuditoria(datos, montoCredito),
    });
  });
}

export async function eliminarDevolucion(actor: ActorAuditoria, id: number): Promise<void> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction(async (tx) => {
    const devolucion = await tx.devolucion.findUniqueOrThrow({
      where: { id },
      include: { devolucionArticulos: true },
    });

    for (const articulo of devolucion.devolucionArticulos) {
      if (articulo.idCatalogo) {
        await ajustarStockTx(tx, actor, {
          idCatalogo: articulo.idCatalogo,
          delta: -(articulo.cantidad ?? 0),
          tipo: "baja_devolucion",
          referenciaTipo: "devolucion",
          referenciaId: id,
          notas: "Reversión por eliminación de devolución",
        });
      }
    }

    await tx.devolucion.delete({ where: { id } });

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "eliminar",
      tablaAfectada: "devoluciones",
      registroId: String(id),
      datosAnteriores: {
        idCliente: devolucion.idCliente,
        montoCredito: decimalAString(devolucion.montoCredito),
      },
    });
  });
}
