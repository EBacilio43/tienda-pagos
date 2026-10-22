import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { registrarAuditoria } from "@/server/audit/registrar";
import { ajustarStockTx } from "./stock";
import { obtenerRegistroDeAuditoria, type RegistroAuditoriaDTO } from "./auditoria";
import { decimalAString, multiplicarMonto } from "@/lib/money";
import { puedeGestionarTransacciones, ErrorPermiso } from "@/lib/permisos";
import type { DatosVenta } from "@/lib/schemas/venta";
import type { Rol } from "@/types/dominio";
import { registrarIdempotenciaTx } from "./idempotencia";

export type ActorAuditoria = { id: number; rol: Rol };

export type VentaParaEditarDTO = {
  id: number;
  idCliente: number;
  fecha: string;
  esquemaPago: string | null;
  frecuenciaPago: string | null;
  tieneEnganche: boolean;
  enganche: string | null;
  articulos: { idCatalogo: number | null; nombre: string; cantidad: number; precioUnitario: string }[];
};

export async function obtenerVentaParaEditar(id: number): Promise<VentaParaEditarDTO | null> {
  const venta = await prisma.venta.findUnique({
    where: { id },
    select: {
      id: true,
      idCliente: true,
      fecha: true,
      esquemaPago: true,
      frecuenciaPago: true,
      tieneEnganche: true,
      enganche: true,
      ventaArticulos: {
        select: {
          idCatalogo: true,
          nombre: true,
          cantidad: true,
          precioUnitario: true,
        },
      },
    },
  });
  if (!venta) return null;

  return {
    id: venta.id,
    idCliente: venta.idCliente,
    fecha: venta.fecha.toISOString().slice(0, 10),
    esquemaPago: venta.esquemaPago,
    frecuenciaPago: venta.frecuenciaPago,
    tieneEnganche: venta.tieneEnganche ?? false,
    enganche: venta.enganche ? decimalAString(venta.enganche) : null,
    // ya no se filtran los artículos sin idCatalogo — antes
    // esto hacía que editar cualquier venta con artículos "libres" (todas
    // las de producción real) mostrara "Sin artículos" y Total $0.00.
    articulos: venta.ventaArticulos.map((a) => ({
      idCatalogo: a.idCatalogo,
      nombre: a.nombre,
      cantidad: a.cantidad ?? 0,
      precioUnitario: a.precioUnitario ? decimalAString(a.precioUnitario) : "0.00",
    })),
  };
}

export type VentaDetalleDTO = {
  id: number;
  clienteId: number;
  clienteNombre: string;
  fecha: string;
  esquemaPago: string | null;
  frecuenciaPago: string | null;
  tieneEnganche: boolean;
  enganche: string | null;
  montoTotal: string;
  articulos: { nombre: string; cantidad: number; precioUnitario: string; subtotal: string }[];
  registro: RegistroAuditoriaDTO;
};

// Pantalla de detalle (a diferencia de obtenerVentaParaEditar, pensado para
// precargar el formulario): trae nombre del cliente, subtotal por línea y
// quién/cuándo la registró — nada de esto lo necesita el form de edición.
export async function obtenerVentaDetalle(id: number): Promise<VentaDetalleDTO | null> {
  const [venta, registro] = await Promise.all([
    prisma.venta.findUnique({
      where: { id },
      select: {
        id: true,
        idCliente: true,
        fecha: true,
        esquemaPago: true,
        frecuenciaPago: true,
        tieneEnganche: true,
        enganche: true,
        montoTotal: true,
        cliente: { select: { nombre: true } },
        ventaArticulos: {
          select: {
            nombre: true,
            cantidad: true,
            precioUnitario: true,
          },
        },
      },
    }),
    obtenerRegistroDeAuditoria("ventas", id),
  ]);
  if (!venta) return null;

  return {
    id: venta.id,
    clienteId: venta.idCliente,
    clienteNombre: venta.cliente.nombre,
    fecha: venta.fecha.toISOString().slice(0, 10),
    esquemaPago: venta.esquemaPago,
    frecuenciaPago: venta.frecuenciaPago,
    tieneEnganche: venta.tieneEnganche ?? false,
    enganche: venta.enganche ? decimalAString(venta.enganche) : null,
    montoTotal: decimalAString(venta.montoTotal ?? new Prisma.Decimal(0)),
    articulos: venta.ventaArticulos.map((a) => {
      const cantidad = a.cantidad ?? 0;
      const precioUnitario = a.precioUnitario ? decimalAString(a.precioUnitario) : "0.00";
      return { nombre: a.nombre, cantidad, precioUnitario, subtotal: multiplicarMonto(precioUnitario, cantidad) };
    }),
    registro,
  };
}

function calcularMontoTotal(
  articulos: readonly { cantidad: number; precioUnitario: string }[]
): Prisma.Decimal {
  return articulos.reduce(
    (acc, a) => acc.plus(new Prisma.Decimal(a.precioUnitario).times(a.cantidad)),
    new Prisma.Decimal(0)
  );
}

function datosParaAuditoria(datos: DatosVenta, montoTotal: Prisma.Decimal) {
  return {
    idCliente: datos.idCliente,
    fecha: datos.fecha,
    esquemaPago: datos.esquemaPago,
    frecuenciaPago: datos.frecuenciaPago ?? null,
    tieneEnganche: datos.tieneEnganche,
    enganche: datos.tieneEnganche ? datos.enganche : null,
    montoTotal: montoTotal.toFixed(2),
    articulos: datos.articulos,
  };
}

// AGENTS.md regla 4/5 + docs/DOMINIO.md: monto_total se deriva SIEMPRE de
// los artículos (Σ cantidad × precio_unitario) — nunca un campo aparte que
// pueda divergir, a diferencia del legacy (logic.py:376). El descuento de
// stock ocurre en la MISMA transacción que la venta — a diferencia del
// legacy (logic.py:391-402, commits sueltos por artículo fuera de la
// transacción de la venta).
export async function crearVenta(
  actor: ActorAuditoria,
  datos: DatosVenta,
  token?: string
): Promise<{ id: number }> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  const montoTotal = calcularMontoTotal(datos.articulos);

  return prisma.$transaction(async (tx) => {
    await registrarIdempotenciaTx(tx, token, "crearVenta");

    const venta = await tx.venta.create({
      data: {
        idCliente: datos.idCliente,
        fecha: new Date(`${datos.fecha}T00:00:00Z`),
        esquemaPago: datos.esquemaPago,
        frecuenciaPago: datos.frecuenciaPago,
        montoTotal: montoTotal.toFixed(2),
        tieneEnganche: datos.tieneEnganche,
        enganche: datos.tieneEnganche ? datos.enganche : null,
        fechaRegistroSistema: new Date(),
        ventaArticulos: {
          create: datos.articulos.map((a) => ({
            idCatalogo: a.idCatalogo ?? null,
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnitario: a.precioUnitario,
          })),
        },
      },
    });

    // un artículo sin idCatalogo (pieza única, sin vínculo al
    // catálogo) no tiene stock que descontar — se salta por completo, no
    // se le puede pedir a stock.ts que ajuste un artículo que no existe ahí.
    for (const articulo of datos.articulos) {
      if (!articulo.idCatalogo) continue;
      await ajustarStockTx(tx, actor, {
        idCatalogo: articulo.idCatalogo,
        delta: -articulo.cantidad,
        tipo: "venta",
        referenciaTipo: "venta",
        referenciaId: venta.id,
      });
    }

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "crear",
      tablaAfectada: "ventas",
      registroId: String(venta.id),
      datosNuevos: datosParaAuditoria(datos, montoTotal),
    });

    return { id: venta.id };
  });
}

export async function actualizarVenta(
  actor: ActorAuditoria,
  id: number,
  datos: DatosVenta
): Promise<void> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  const montoTotal = calcularMontoTotal(datos.articulos);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.venta.findUniqueOrThrow({
      where: { id },
      include: { ventaArticulos: true },
    });

    // Revertir el stock de los artículos previos antes de aplicar los
    // nuevos — a diferencia del legacy (update_sale no toca stock).
    for (const previo of anterior.ventaArticulos) {
      if (previo.idCatalogo) {
        await ajustarStockTx(tx, actor, {
          idCatalogo: previo.idCatalogo,
          delta: previo.cantidad ?? 0,
          tipo: "edicion_venta_reversion",
          referenciaTipo: "venta",
          referenciaId: id,
          notas: "Reversión por edición de venta",
        });
      }
    }

    await tx.ventaArticulo.deleteMany({ where: { idVenta: id } });

    await tx.venta.update({
      where: { id },
      data: {
        idCliente: datos.idCliente,
        fecha: new Date(`${datos.fecha}T00:00:00Z`),
        esquemaPago: datos.esquemaPago,
        frecuenciaPago: datos.frecuenciaPago,
        montoTotal: montoTotal.toFixed(2),
        tieneEnganche: datos.tieneEnganche,
        enganche: datos.tieneEnganche ? datos.enganche : null,
        ventaArticulos: {
          create: datos.articulos.map((a) => ({
            idCatalogo: a.idCatalogo ?? null,
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnitario: a.precioUnitario,
          })),
        },
      },
    });

    for (const articulo of datos.articulos) {
      if (!articulo.idCatalogo) continue;
      await ajustarStockTx(tx, actor, {
        idCatalogo: articulo.idCatalogo,
        delta: -articulo.cantidad,
        tipo: "edicion_venta",
        referenciaTipo: "venta",
        referenciaId: id,
      });
    }

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "actualizar",
      tablaAfectada: "ventas",
      registroId: String(id),
      datosAnteriores: {
        montoTotal: anterior.montoTotal ? decimalAString(anterior.montoTotal) : null,
        articulos: anterior.ventaArticulos.map((a) => ({
          nombre: a.nombre,
          cantidad: a.cantidad,
        })),
      },
      datosNuevos: datosParaAuditoria(datos, montoTotal),
    });
  });
}

export async function eliminarVenta(actor: ActorAuditoria, id: number): Promise<void> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findUniqueOrThrow({
      where: { id },
      include: { ventaArticulos: true },
    });

    for (const articulo of venta.ventaArticulos) {
      if (articulo.idCatalogo) {
        await ajustarStockTx(tx, actor, {
          idCatalogo: articulo.idCatalogo,
          delta: articulo.cantidad ?? 0,
          tipo: "baja_venta",
          referenciaTipo: "venta",
          referenciaId: id,
          notas: "Reversión por eliminación de venta",
        });
      }
    }

    // ventaArticulos tiene onDelete: Cascade — se borran solos con la venta.
    await tx.venta.delete({ where: { id } });

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "eliminar",
      tablaAfectada: "ventas",
      registroId: String(id),
      datosAnteriores: {
        idCliente: venta.idCliente,
        montoTotal: venta.montoTotal ? decimalAString(venta.montoTotal) : null,
      },
    });
  });
}
