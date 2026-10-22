import {
  sumarMontos,
  restarMontos,
  compararMontos,
  REGEX_MONTO_POSITIVO,
} from "@/lib/money";

export type FilaParaCascada = {
  idCliente: string;
  monto: string;
};

export type ResultadoRenglonCascada = {
  /** Saldo proyectado antes de aplicar este renglón. Undefined si el cliente no está seleccionado o no existe. */
  saldoAnterior: string | undefined;
  /** Saldo proyectado después de aplicar este renglón. Undefined si no hay monto válido o falta cliente. */
  resultante: string | undefined;
  /** Posición 1-based del abono para este cliente dentro del lote (ej. 1 para el primero, 2 para el segundo). 0 si no hay cliente. */
  indiceEnCliente: number;
  /** Cantidad total de renglones en el lote donde este cliente está seleccionado. 0 si no hay cliente. */
  totalAbonosCliente: number;
  /** Suma acumulada de todos los abonos válidos para este cliente en el lote entero. */
  montoTotalCliente: string;
  /** Saldo final proyectado del cliente tras aplicar todos los abonos válidos del lote. */
  saldoFinalCliente: string | undefined;
  /** Indica si la deducción acumulada hasta este renglón excede el saldo adeudado inicial (resultante < 0). */
  superaSaldo: boolean;
  /** Indica si el total acumulado de todos los abonos del cliente en el lote excede el saldo adeudado inicial. */
  totalSuperaSaldo: boolean;
};

export function esMontoValido(monto: string): boolean {
  return REGEX_MONTO_POSITIVO.test(monto.trim());
}

/**
 * P16: Calcula el saldo proyectado en cascada para cada renglón de captura rápida de abonos.
 * Si un cliente aparece múltiples veces en el lote, cada fila encadena el saldo anterior
 * proyectado deduciendo los abonos válidos previos de ese mismo cliente.
 */
export function calcularSaldosEnCascada<T extends FilaParaCascada>(
  filas: T[],
  saldoPorCliente: Map<number, string> | ((clienteId: number) => string | undefined)
): ResultadoRenglonCascada[] {
  const obtenerSaldo = (id: number): string | undefined => {
    return typeof saldoPorCliente === "function" ? saldoPorCliente(id) : saldoPorCliente.get(id);
  };

  // Paso 1: Conteo total de apariciones por cliente y lista de abonos válidos
  const conteoPorCliente = new Map<number, number>();
  const montosValidosPorCliente = new Map<number, string[]>();

  for (const f of filas) {
    if (!f.idCliente) continue;
    const id = Number(f.idCliente);
    if (Number.isNaN(id) || id <= 0) continue;

    conteoPorCliente.set(id, (conteoPorCliente.get(id) ?? 0) + 1);

    if (esMontoValido(f.monto)) {
      const lista = montosValidosPorCliente.get(id) ?? [];
      lista.push(f.monto.trim());
      montosValidosPorCliente.set(id, lista);
    }
  }

  // Paso 2: Resúmenes globales por cliente en el lote
  const resumenPorCliente = new Map<
    number,
    {
      montoTotalCliente: string;
      saldoFinalCliente: string | undefined;
      totalSuperaSaldo: boolean;
    }
  >();

  for (const [id] of conteoPorCliente) {
    const lista = montosValidosPorCliente.get(id) ?? [];
    const montoTotalCliente = lista.length > 0 ? sumarMontos(...lista) : "0.00";
    const saldoBase = obtenerSaldo(id);

    let saldoFinalCliente: string | undefined = undefined;
    let totalSuperaSaldo = false;

    if (saldoBase !== undefined) {
      saldoFinalCliente = restarMontos(saldoBase, montoTotalCliente);
      if (compararMontos(saldoBase, "0.00") > 0) {
        totalSuperaSaldo = compararMontos(montoTotalCliente, saldoBase) > 0;
      } else {
        totalSuperaSaldo = compararMontos(montoTotalCliente, "0.00") > 0;
      }
    }

    resumenPorCliente.set(id, {
      montoTotalCliente,
      saldoFinalCliente,
      totalSuperaSaldo,
    });
  }

  // Paso 3: Encadenamiento en cascada fila por fila
  const aparicionPorCliente = new Map<number, number>();
  const acumuladoPrevioPorCliente = new Map<number, string>();

  return filas.map((f): ResultadoRenglonCascada => {
    if (!f.idCliente) {
      return {
        saldoAnterior: undefined,
        resultante: undefined,
        indiceEnCliente: 0,
        totalAbonosCliente: 0,
        montoTotalCliente: "0.00",
        saldoFinalCliente: undefined,
        superaSaldo: false,
        totalSuperaSaldo: false,
      };
    }

    const id = Number(f.idCliente);
    if (Number.isNaN(id) || id <= 0) {
      return {
        saldoAnterior: undefined,
        resultante: undefined,
        indiceEnCliente: 0,
        totalAbonosCliente: 0,
        montoTotalCliente: "0.00",
        saldoFinalCliente: undefined,
        superaSaldo: false,
        totalSuperaSaldo: false,
      };
    }

    const saldoBase = obtenerSaldo(id);
    const totalAbonosCliente = conteoPorCliente.get(id) ?? 0;
    const resumen = resumenPorCliente.get(id);
    const montoTotalCliente = resumen?.montoTotalCliente ?? "0.00";
    const saldoFinalCliente = resumen?.saldoFinalCliente;
    const totalSuperaSaldo = resumen?.totalSuperaSaldo ?? false;

    const indiceEnCliente = (aparicionPorCliente.get(id) ?? 0) + 1;
    aparicionPorCliente.set(id, indiceEnCliente);

    if (saldoBase === undefined) {
      return {
        saldoAnterior: undefined,
        resultante: undefined,
        indiceEnCliente,
        totalAbonosCliente,
        montoTotalCliente,
        saldoFinalCliente: undefined,
        superaSaldo: false,
        totalSuperaSaldo: false,
      };
    }

    const acumuladoPrevio = acumuladoPrevioPorCliente.get(id) ?? "0.00";
    const saldoAnterior = restarMontos(saldoBase, acumuladoPrevio);

    let resultante: string | undefined = undefined;
    let superaSaldo = false;

    if (esMontoValido(f.monto)) {
      const montoLimpio = f.monto.trim();
      resultante = restarMontos(saldoAnterior, montoLimpio);
      acumuladoPrevioPorCliente.set(id, sumarMontos(acumuladoPrevio, montoLimpio));

      if (compararMontos(saldoBase, "0.00") > 0) {
        superaSaldo = compararMontos(resultante, "0.00") < 0;
      } else {
        superaSaldo = compararMontos(montoLimpio, "0.00") > 0;
      }
    }

    return {
      saldoAnterior,
      resultante,
      indiceEnCliente,
      totalAbonosCliente,
      montoTotalCliente,
      saldoFinalCliente,
      superaSaldo,
      totalSuperaSaldo,
    };
  });
}
