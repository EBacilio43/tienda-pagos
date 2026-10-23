// Sin `import "server-only"`, como el resto de server/services/*: los
// scripts de scripts/ importan estos servicios fuera del bundler de Next y
// ese paquete revienta en Node plano (ver el comentario de server/db/prisma.ts).
// La barrera contra que esto llegue al cliente es la regla ESLint
// no-restricted-imports, no este import.
import { prisma } from "@/server/db/prisma";
import { registrarAuditoria, registrarAuditoriaEnLote } from "@/server/audit/registrar";
import { fechaAString } from "@/lib/fecha";
import { decimalAString } from "@/lib/money";
import { ErrorPermiso, puedeGestionarTransacciones } from "@/lib/permisos";
import { ErrorDominio } from "@/lib/errores";
import type { Rol } from "@/types/dominio";
import type { CuentaLibreta } from "@/lib/schemas/libreta";

export type ActorAuditoria = { id: number; rol: Rol };

export type ResultadoCarga = {
  clienteId: number;
  clienteCreado: boolean;
  /** La venta sintética que representa el `saldoInicial`, si la hubo. */
  ventaDeApertura: boolean;
  ventas: number;
  articulosVenta: number;
  pagos: number;
  devoluciones: number;
  articulosDevolucion: number;
};

/**
 * Carga una cuenta completa transcrita de una libreta de papel.
 *
 * **El chunk es la cuenta, no el renglón.** Todo va en una transacción: o
 * entra el cliente con todas sus ventas, abonos y devoluciones, o no entra
 * nada. El motivo es de negocio antes que técnico — media cuenta cargada da
 * un saldo que parece real y es falso, y nadie tiene forma de notarlo. Una
 * cuenta que no entró se vuelve a intentar.
 *
 * Lo que importa no es solo cuántas filas se escriben sino cuántas **idas y vueltas**
 * cuesta escribirlas en una base remota.
 *
 * Por eso los abonos van en lote —`createManyAndReturn` más una auditoría
 * en lote— y son dos viajes en vez de dos por abono. La regla 5 no se
 * relaja: sigue habiendo un renglón de auditoría por registro con su
 * `registro_id` real. Las ventas siguen de a una porque cada una necesita
 * su id para colgarle los artículos, y son pocas (el máximo real es 11).
 *
 * **No toca stock, y eso es correcto, no un olvido** (regla 4): los
 * artículos de libreta van con `idCatalogo` en null —son piezas históricas
 * sin vínculo al catálogo, la decisión de — y `crearVenta` ya
 * omite `ajustarStockTx` para esos. Verificado contra producción: catálogo
 * vacío, 0 artículos vinculados, 0 movimientos de stock.
 *
 * **`saldoInicial` entra como una venta de apertura.** Hay cuentas de años
 * cuyo arranque ya no se encuentra: la hoja transcrita abre con una "resta"
 * heredada de una libreta anterior. Esa deuda es real y hay que cargarla,
 * pero el modelo solo sabe crear deuda con una venta, así que se sintetiza
 * una en vez de agregarle un término a la fórmula del saldo (regla 3: la
 * fórmula vive en `v_saldos_cliente` y no se toca). Lleva un artículo con
 * nombre explícito para que la pantalla de detalle diga qué es y no parezca
 * una venta sin desglosar.
 */
export async function cargarCuentaDeLibreta(
  actor: ActorAuditoria,
  cuenta: CuentaLibreta
): Promise<ResultadoCarga> {
  if (!puedeGestionarTransacciones(actor.rol)) throw new ErrorPermiso();

  const apertura = ventaDeApertura(cuenta);

  const totalEscrituras =
    (apertura ? 2 : 0) +
    cuenta.ventas.length +
    cuenta.ventas.reduce((n, v) => n + v.articulos.length, 0) +
    cuenta.pagos.length +
    cuenta.devoluciones.length +
    cuenta.devoluciones.reduce((n, d) => n + d.articulos.length, 0);

  if (totalEscrituras > MAXIMO_ESCRITURAS_POR_CUENTA) {
    throw new ErrorDominio(
      `La cuenta tiene ${totalEscrituras} registros y el máximo por carga es ` +
        `${MAXIMO_ESCRITURAS_POR_CUENTA}. Pártela en dos archivos: el cliente ` +
        `puede ir con id en el segundo para que ambos caigan en la misma cuenta.`
    );
  }

  return prisma.$transaction(async (tx) => {
    // ── Cliente ────────────────────────────────────────────────────────
    let clienteId: number;
    let clienteCreado = false;

    if (cuenta.cliente.id !== null) {
      const existente = await tx.cliente.findUnique({
        where: { id: cuenta.cliente.id },
        select: { id: true, nombre: true },
      });
      if (!existente) {
        throw new ErrorDominio(
          `No existe un cliente con id ${cuenta.cliente.id}. Corre el validador ` +
            `para ver la lista de clientes y sus ids.`
        );
      }
      clienteId = existente.id;
    } else {
      const cliente = await tx.cliente.create({
        data: {
          nombre: cuenta.cliente.nombre,
          telefono: cuenta.cliente.telefono,
          email: cuenta.cliente.email,
          empresa: cuenta.cliente.empresa,
          calle: cuenta.cliente.calle,
          numExt: cuenta.cliente.numExt,
          numInt: cuenta.cliente.numInt,
          colonia: cuenta.cliente.colonia,
          municipio: cuenta.cliente.municipio,
          estado: cuenta.cliente.estado,
          cp: cuenta.cliente.cp,
          fechaRegistro: new Date(),
        },
      });
      clienteId = cliente.id;
      clienteCreado = true;

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "crear",
        tablaAfectada: "clientes",
        registroId: String(cliente.id),
        datosNuevos: { nombre: cuenta.cliente.nombre, origen: ORIGEN },
      });
    }

    // ── Venta de apertura por el saldo heredado ────────────────────────
    if (apertura) {
      const venta = await tx.venta.create({
        data: {
          idCliente: clienteId,
          fecha: aFechaUTC(apertura.fecha),
          montoTotal: apertura.monto,
          tieneEnganche: false,
          enganche: "0.00",
          fechaRegistroSistema: new Date(),
        },
      });

      await tx.ventaArticulo.create({
        data: {
          idVenta: venta.id,
          nombre: CONCEPTO_SALDO_INICIAL,
          cantidad: 1,
          precioUnitario: apertura.monto,
          idCatalogo: null,
        },
      });

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "crear",
        tablaAfectada: "ventas",
        registroId: String(venta.id),
        datosNuevos: {
          fecha: apertura.fecha,
          montoTotal: apertura.monto,
          concepto: CONCEPTO_SALDO_INICIAL,
          origen: ORIGEN,
        },
      });
    }

    // ── Ventas y sus artículos ─────────────────────────────────────────
    let articulosVenta = 0;

    for (const v of cuenta.ventas) {
      const venta = await tx.venta.create({
        data: {
          idCliente: clienteId,
          fecha: aFechaUTC(v.fecha),
          montoTotal: v.montoTotal,
          tieneEnganche: v.tieneEnganche,
          enganche: v.enganche,
          fechaRegistroSistema: new Date(),
        },
      });

      if (v.articulos.length > 0) {
        await tx.ventaArticulo.createMany({
          data: v.articulos.map((a) => ({
            idVenta: venta.id,
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnitario: a.precioUnitario,
            // Null a propósito: pieza histórica sin vínculo al catálogo.
            idCatalogo: null,
          })),
        });
        articulosVenta += v.articulos.length;
      }

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "crear",
        tablaAfectada: "ventas",
        registroId: String(venta.id),
        datosNuevos: {
          fecha: v.fecha,
          montoTotal: v.montoTotal,
          enganche: v.enganche,
          articulos: v.articulos.length,
          origen: ORIGEN,
        },
      });
    }

    // ── Pagos ──────────────────────────────────────────────────────────
    // Dos viajes a la base en total, no dos por abono. Una libreta es
    // mayormente abonos —hay cuentas de 159— y en fila de a uno eso son más
    // de 300 idas y vueltas dentro de una sola transacción. Ver la nota de
    // cabecera sobre el timeout.
    if (cuenta.pagos.length > 0) {
      const creados = await tx.pago.createManyAndReturn({
        data: cuenta.pagos.map((p) => ({
          idCliente: clienteId,
          fecha: aFechaUTC(p.fecha),
          monto: p.monto,
          metodoPago: p.metodoPago,
          referencia: p.referencia,
          notas: p.notas,
          fechaRegistroSistema: new Date(),
        })),
      });

      // Regla 5: un renglón por registro con su id real, no uno solo que
      // diga "se cargó una libreta". Los datos salen de lo que la base
      // devolvió y no del arreglo de entrada, para no depender de que el
      // orden de `createManyAndReturn` coincida con el del INSERT.
      await registrarAuditoriaEnLote(
        tx,
        creados.map((pago) => ({
          actorId: actor.id,
          accion: "crear",
          tablaAfectada: "pagos",
          registroId: String(pago.id),
          datosNuevos: {
            fecha: fechaAString(pago.fecha),
            monto: decimalAString(pago.monto),
            origen: ORIGEN,
          },
        }))
      );
    }

    // ── Devoluciones y sus artículos ───────────────────────────────────
    let articulosDevolucion = 0;

    for (const d of cuenta.devoluciones) {
      const devolucion = await tx.devolucion.create({
        data: {
          idCliente: clienteId,
          fecha: aFechaUTC(d.fecha),
          motivo: d.motivo,
          montoCredito: d.montoCredito,
          fechaRegistroSistema: new Date(),
        },
      });

      if (d.articulos.length > 0) {
        await tx.devolucionArticulo.createMany({
          data: d.articulos.map((a) => ({
            idDevolucion: devolucion.id,
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnitario: a.precioUnitario,
            idCatalogo: null,
          })),
        });
        articulosDevolucion += d.articulos.length;
      }

      await registrarAuditoria(tx, {
        actorId: actor.id,
        accion: "crear",
        tablaAfectada: "devoluciones",
        registroId: String(devolucion.id),
        datosNuevos: {
          fecha: d.fecha,
          montoCredito: d.montoCredito,
          articulos: d.articulos.length,
          origen: ORIGEN,
        },
      });
    }

    return {
      clienteId,
      clienteCreado,
      ventaDeApertura: apertura !== null,
      ventas: cuenta.ventas.length,
      articulosVenta,
      pagos: cuenta.pagos.length,
      devoluciones: cuenta.devoluciones.length,
      articulosDevolucion,
    };
  });
}

/**
 * Queda en la auditoría para poder distinguir después lo que entró por
 * transcripción de libreta de lo que se capturó en pantalla. Si mañana
 * aparece un saldo raro, la primera pregunta es de dónde salió el dato.
 */
const ORIGEN = "carga_libreta";

/**
 * Tope de escrituras por transacción. No es un límite del negocio sino de
 * la latencia: ver el comentario de cabecera. 200 deja margen de sobra para
 * una libreta real (~25) sin acercarse al timeout de 20 s.
 */
const MAXIMO_ESCRITURAS_POR_CUENTA = 200;

/**
 * Nombre del artículo de la venta de apertura. Es lo único que va a leer
 * quien abra esa venta en `/ventas/[id]` dentro de un año, así que dice de
 * dónde salió el monto en vez de dejar la venta sin desglose.
 */
export const CONCEPTO_SALDO_INICIAL = "Saldo inicial traspasado de libreta anterior";

/**
 * Regla 2: `ventas.fecha`, `pagos.fecha` y `devoluciones.fecha` son DATE.
 * Construir el Date con la medianoche UTC explícita evita que la zona del
 * proceso corra el día uno hacia atrás.
 */
function aFechaUTC(fecha: string): Date {
  return new Date(`${fecha}T00:00:00Z`);
}

/**
 * La venta sintética que representa el `saldoInicial`, o `null` si la cuenta
 * no trae uno (o trae "0.00", que es lo mismo que no traerlo).
 *
 * La fecha es la del movimiento más antiguo de la cuenta. No es una fecha
 * inventada: el saldo inicial es, por definición, lo que se debía al abrir
 * la hoja que se está transcribiendo, y el primer renglón de esa hoja es el
 * movimiento más viejo que hay. Fecharla después dejaría abonos aplicados
 * contra una deuda que "todavía no existía".
 */
export function ventaDeApertura(
  cuenta: CuentaLibreta
): { fecha: string; monto: string } | null {
  if (cuenta.saldoInicial === null || Number(cuenta.saldoInicial) === 0) return null;

  const fechas = [
    ...cuenta.ventas.map((v) => v.fecha),
    ...cuenta.pagos.map((p) => p.fecha),
    ...cuenta.devoluciones.map((d) => d.fecha),
  ].sort();

  if (fechas.length === 0) {
    throw new ErrorDominio(
      `La cuenta trae un saldo inicial de ${cuenta.saldoInicial} pero no tiene ` +
        `ningún movimiento, así que no hay con qué fecharlo. Agrega al menos el ` +
        `renglón con el que abre la hoja.`
    );
  }

  return { fecha: fechas[0], monto: cuenta.saldoInicial };
}
