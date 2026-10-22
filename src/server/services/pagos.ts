import { prisma } from "@/server/db/prisma";
import { registrarAuditoria } from "@/server/audit/registrar";
import { obtenerRegistroDeAuditoria, type RegistroAuditoriaDTO } from "./auditoria";
import { decimalAString } from "@/lib/money";
import { puedeGestionarTransacciones, ErrorPermiso } from "@/lib/permisos";
import type { DatosPago } from "@/lib/schemas/pago";
import type { Rol } from "@/types/dominio";
import { registrarIdempotenciaTx } from "./idempotencia";

export type ActorAuditoria = { id: number; rol: Rol };

export type PagoParaEditarDTO = {
  id: number;
  idCliente: number;
  fecha: string;
  monto: string;
  metodoPago: string | null;
  referencia: string | null;
  notas: string | null;
};

export async function obtenerPagoParaEditar(id: number): Promise<PagoParaEditarDTO | null> {
  const pago = await prisma.pago.findUnique({
    where: { id },
    select: {
      id: true,
      idCliente: true,
      fecha: true,
      monto: true,
      metodoPago: true,
      referencia: true,
      notas: true,
    },
  });
  if (!pago) return null;
  return {
    id: pago.id,
    idCliente: pago.idCliente,
    fecha: pago.fecha.toISOString().slice(0, 10),
    monto: decimalAString(pago.monto),
    metodoPago: pago.metodoPago,
    referencia: pago.referencia,
    notas: pago.notas,
  };
}

export type PagoDetalleDTO = {
  id: number;
  clienteId: number;
  clienteNombre: string;
  fecha: string;
  monto: string;
  metodoPago: string | null;
  referencia: string | null;
  notas: string | null;
  registro: RegistroAuditoriaDTO;
};

export async function obtenerPagoDetalle(id: number): Promise<PagoDetalleDTO | null> {
  const [pago, registro] = await Promise.all([
    prisma.pago.findUnique({
      where: { id },
      select: {
        id: true,
        idCliente: true,
        fecha: true,
        monto: true,
        metodoPago: true,
        referencia: true,
        notas: true,
        cliente: { select: { nombre: true } },
      },
    }),
    obtenerRegistroDeAuditoria("pagos", id),
  ]);
  if (!pago) return null;

  return {
    id: pago.id,
    clienteId: pago.idCliente,
    clienteNombre: pago.cliente.nombre,
    fecha: pago.fecha.toISOString().slice(0, 10),
    monto: decimalAString(pago.monto),
    metodoPago: pago.metodoPago,
    referencia: pago.referencia,
    notas: pago.notas,
    registro,
  };
}

function datosParaAuditoria(datos: DatosPago) {
  return {
    idCliente: datos.idCliente,
    fecha: datos.fecha,
    monto: datos.monto,
    metodoPago: datos.metodoPago ?? null,
    referencia: datos.referencia ?? null,
    notas: datos.notas ?? null,
  };
}

export async function crearPago(
  actor: ActorAuditoria,
  datos: DatosPago,
  token?: string
): Promise<{ id: number }> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  return prisma.$transaction(async (tx) => {
    await registrarIdempotenciaTx(tx, token, "crearPago");

    const pago = await tx.pago.create({
      data: {
        idCliente: datos.idCliente,
        fecha: new Date(`${datos.fecha}T00:00:00Z`),
        monto: datos.monto,
        metodoPago: datos.metodoPago,
        referencia: datos.referencia,
        notas: datos.notas,
        fechaRegistroSistema: new Date(),
      },
    });

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "crear",
      tablaAfectada: "pagos",
      registroId: String(pago.id),
      datosNuevos: datosParaAuditoria(datos),
    });

    return { id: pago.id };
  });
}

// Clave de identidad "es el mismo abono": mismo cliente, mismo día, mismo
// monto. No es una restricción de la base a propósito — un cliente sí puede
// abonar dos veces la misma cantidad el mismo día, y el sistema no puede
// saber si eso es un error de captura o la realidad. Por eso esto solo
// alimenta un AVISO en la UI, nunca un rechazo.
export function claveDuplicado(p: { idCliente: number; fecha: string; monto: string }): string {
  return `${p.idCliente}|${p.fecha}|${p.monto}`;
}

export async function buscarPagosDuplicados(
  candidatos: { idCliente: number; fecha: string; monto: string }[]
): Promise<Set<string>> {
  if (candidatos.length === 0) return new Set();

  const fechasValidas = [
    ...new Set(
      candidatos
        .map((c) => new Date(`${c.fecha}T00:00:00Z`).getTime())
        .filter((t) => !Number.isNaN(t))
    ),
  ].map((t) => new Date(t));

  if (fechasValidas.length === 0) return new Set();

  // Una sola consulta acotada a los clientes y fechas involucrados, y el
  // cruce en memoria — no una consulta por renglón capturado.
  const existentes = await prisma.pago.findMany({
    where: {
      idCliente: { in: [...new Set(candidatos.map((c) => c.idCliente))] },
      fecha: { in: fechasValidas },
    },
    select: { idCliente: true, fecha: true, monto: true },
  });

  return new Set(
    existentes.map((p) =>
      claveDuplicado({
        idCliente: p.idCliente,
        fecha: p.fecha.toISOString().slice(0, 10),
        monto: decimalAString(p.monto),
      })
    )
  );
}

// Captura en lote, todo o nada — mismo criterio que guardarCatalogoEnLote.
// Si un renglón viene mal, no se guarda ninguno: la captura sigue viva del
// lado del cliente, así que no se pierde nada al rechazar, y en cambio un
// guardado parcial dejaría al operador sin saber cuáles sí entraron.
//
// El bucle son 2 viajes por renglón (create + auditoría). Con el tope de 50
// y el timeout de 20 s del cliente Prisma (server/db/prisma.ts) hay margen
// de sobra incluso contra una base remota.
export async function crearPagosEnLote(
  actor: ActorAuditoria,
  filas: DatosPago[],
  token?: string
): Promise<{ ids: number[] }> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();
  if (filas.length === 0) return { ids: [] };

  return prisma.$transaction(async (tx) => {
    await registrarIdempotenciaTx(tx, token, "crearPagosEnLote");

    const ids: number[] = [];

    for (const datos of filas) {
      const pago = await tx.pago.create({
        data: {
          idCliente: datos.idCliente,
          fecha: new Date(`${datos.fecha}T00:00:00Z`),
          monto: datos.monto,
          metodoPago: datos.metodoPago,
          referencia: datos.referencia,
          notas: datos.notas,
          fechaRegistroSistema: new Date(),
        },
      });

      // Regla 5: una fila de auditoría por registro afectado, con su
      // registro_id real — no un solo renglón "se capturó un lote".
      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "crear",
        tablaAfectada: "pagos",
        registroId: String(pago.id),
        datosNuevos: { ...datosParaAuditoria(datos), origen: "captura_en_lote" },
      });

      ids.push(pago.id);
    }

    return { ids };
  });
}

export async function actualizarPago(
  actor: ActorAuditoria,
  id: number,
  datos: DatosPago
): Promise<void> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.pago.findUniqueOrThrow({ where: { id } });

    await tx.pago.update({
      where: { id },
      data: {
        idCliente: datos.idCliente,
        fecha: new Date(`${datos.fecha}T00:00:00Z`),
        monto: datos.monto,
        metodoPago: datos.metodoPago,
        referencia: datos.referencia,
        notas: datos.notas,
      },
    });

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "actualizar",
      tablaAfectada: "pagos",
      registroId: String(id),
      datosAnteriores: {
        monto: decimalAString(anterior.monto),
        metodoPago: anterior.metodoPago,
        referencia: anterior.referencia,
      },
      datosNuevos: datosParaAuditoria(datos),
    });
  });
}

export async function eliminarPago(actor: ActorAuditoria, id: number): Promise<void> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  await prisma.$transaction(async (tx) => {
    const pago = await tx.pago.findUniqueOrThrow({ where: { id } });
    await tx.pago.delete({ where: { id } });

    await registrarAuditoria(tx, {
      actorId: actor.id,
      accion: "eliminar",
      tablaAfectada: "pagos",
      registroId: String(id),
      datosAnteriores: {
        idCliente: pago.idCliente,
        monto: decimalAString(pago.monto),
      },
    });
  });
}
