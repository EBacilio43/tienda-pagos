import { describe, it, expect } from "vitest";
import {
  calcularSaldosEnCascada,
  esMontoValido,
  type FilaParaCascada,
} from "@/lib/abonos-cascada";

describe("esMontoValido", () => {
  it("acepta montos positivos estándar y enteros", () => {
    expect(esMontoValido("100")).toBe(true);
    expect(esMontoValido("100.50")).toBe(true);
    expect(esMontoValido("0.01")).toBe(true);
    expect(esMontoValido(" 500.00 ")).toBe(true);
  });

  it("rechaza cero, negativos y texto no numérico", () => {
    expect(esMontoValido("0")).toBe(false);
    expect(esMontoValido("0.00")).toBe(false);
    expect(esMontoValido("-10.00")).toBe(false);
    expect(esMontoValido("abc")).toBe(false);
    expect(esMontoValido("")).toBe(false);
  });
});

describe("calcularSaldosEnCascada", () => {
  const saldos = new Map<number, string>([
    [1, "56000.00"],
    [2, "1000.00"],
    [3, "0.00"],
    [4, "-50.00"], // Saldo a favor previo
  ]);

  describe("un solo abono por cliente", () => {
    it("calcula saldo proyectado restando el monto del saldo actual de BD", () => {
      const filas: FilaParaCascada[] = [{ idCliente: "1", monto: "3000.00" }];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res).toHaveLength(1);
      expect(res[0]).toEqual({
        saldoAnterior: "56000.00",
        resultante: "53000.00",
        indiceEnCliente: 1,
        totalAbonosCliente: 1,
        montoTotalCliente: "3000.00",
        saldoFinalCliente: "53000.00",
        superaSaldo: false,
        totalSuperaSaldo: false,
      });
    });

    it("mantiene saldo anterior sin resultante si el monto está vacío", () => {
      const filas: FilaParaCascada[] = [{ idCliente: "1", monto: "" }];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].saldoAnterior).toBe("56000.00");
      expect(res[0].resultante).toBeUndefined();
      expect(res[0].indiceEnCliente).toBe(1);
      expect(res[0].totalAbonosCliente).toBe(1);
      expect(res[0].montoTotalCliente).toBe("0.00");
      expect(res[0].saldoFinalCliente).toBe("56000.00");
      expect(res[0].superaSaldo).toBe(false);
      expect(res[0].totalSuperaSaldo).toBe(false);
    });

    it("mantiene saldo anterior sin resultante si el monto es inválido", () => {
      const filas: FilaParaCascada[] = [{ idCliente: "2", monto: "0.00" }];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].saldoAnterior).toBe("1000.00");
      expect(res[0].resultante).toBeUndefined();
      expect(res[0].montoTotalCliente).toBe("0.00");
    });

    it("devuelve campos vacíos si la fila no tiene cliente seleccionado", () => {
      const filas: FilaParaCascada[] = [{ idCliente: "", monto: "500.00" }];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].saldoAnterior).toBeUndefined();
      expect(res[0].resultante).toBeUndefined();
      expect(res[0].indiceEnCliente).toBe(0);
      expect(res[0].totalAbonosCliente).toBe(0);
      expect(res[0].montoTotalCliente).toBe("0.00");
      expect(res[0].saldoFinalCliente).toBeUndefined();
    });

    it("devuelve undefined en saldos si el cliente no existe en la base", () => {
      const filas: FilaParaCascada[] = [{ idCliente: "999", monto: "500.00" }];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].saldoAnterior).toBeUndefined();
      expect(res[0].resultante).toBeUndefined();
      expect(res[0].saldoFinalCliente).toBeUndefined();
      expect(res[0].indiceEnCliente).toBe(1);
      expect(res[0].totalAbonosCliente).toBe(1);
    });
  });

  describe("múltiples abonos del mismo cliente (cascada encadenada)", () => {
    it("encadena el saldo proyectado entre filas consecutivas del mismo cliente (P16)", () => {
      // Caso de prueba: Cliente A debe $56,000.00 y se capturan dos abonos de $3,000.00
      const filas: FilaParaCascada[] = [
        { idCliente: "1", monto: "3000.00" },
        { idCliente: "1", monto: "3000.00" },
      ];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res).toHaveLength(2);

      // Fila 0: 56,000.00 -> 53,000.00 (Abono 1 de 2)
      expect(res[0].saldoAnterior).toBe("56000.00");
      expect(res[0].resultante).toBe("53000.00");
      expect(res[0].indiceEnCliente).toBe(1);
      expect(res[0].totalAbonosCliente).toBe(2);
      expect(res[0].montoTotalCliente).toBe("6000.00");
      expect(res[0].saldoFinalCliente).toBe("50000.00");

      // Fila 1: encadena desde 53,000.00 -> 50,000.00 (Abono 2 de 2)
      expect(res[1].saldoAnterior).toBe("53000.00");
      expect(res[1].resultante).toBe("50000.00");
      expect(res[1].indiceEnCliente).toBe(2);
      expect(res[1].totalAbonosCliente).toBe(2);
      expect(res[1].montoTotalCliente).toBe("6000.00");
      expect(res[1].saldoFinalCliente).toBe("50000.00");
    });

    it("encadena correctamente cuando las filas del mismo cliente están intercaladas", () => {
      const filas: FilaParaCascada[] = [
        { idCliente: "1", monto: "3000.00" }, // Cliente 1: Abono 1 de 2
        { idCliente: "2", monto: "200.00" },  // Cliente 2: Abono 1 de 1
        { idCliente: "1", monto: "1500.00" }, // Cliente 1: Abono 2 de 2
      ];
      const res = calcularSaldosEnCascada(filas, saldos);

      // Fila 0 (Cliente 1): 56000 -> 53000
      expect(res[0].saldoAnterior).toBe("56000.00");
      expect(res[0].resultante).toBe("53000.00");
      expect(res[0].indiceEnCliente).toBe(1);
      expect(res[0].totalAbonosCliente).toBe(2);

      // Fila 1 (Cliente 2): 1000 -> 800
      expect(res[1].saldoAnterior).toBe("1000.00");
      expect(res[1].resultante).toBe("800.00");
      expect(res[1].indiceEnCliente).toBe(1);
      expect(res[1].totalAbonosCliente).toBe(1);

      // Fila 2 (Cliente 1): 53000 -> 51500
      expect(res[2].saldoAnterior).toBe("53000.00");
      expect(res[2].resultante).toBe("51500.00");
      expect(res[2].indiceEnCliente).toBe(2);
      expect(res[2].totalAbonosCliente).toBe(2);
      expect(res[2].montoTotalCliente).toBe("4500.00");
      expect(res[2].saldoFinalCliente).toBe("51500.00");
    });

    it("maneja fila intermedia sin monto sin romper la cascada de las siguientes", () => {
      const filas: FilaParaCascada[] = [
        { idCliente: "1", monto: "3000.00" }, // 56000 -> 53000
        { idCliente: "1", monto: "" },        // 53000 (sin resultante)
        { idCliente: "1", monto: "2000.00" }, // 53000 -> 51000
      ];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].saldoAnterior).toBe("56000.00");
      expect(res[0].resultante).toBe("53000.00");

      expect(res[1].saldoAnterior).toBe("53000.00");
      expect(res[1].resultante).toBeUndefined();

      expect(res[2].saldoAnterior).toBe("53000.00");
      expect(res[2].resultante).toBe("51000.00");
      expect(res[2].montoTotalCliente).toBe("5000.00");
      expect(res[2].saldoFinalCliente).toBe("51000.00");
      expect(res[2].totalAbonosCliente).toBe(3);
    });

    it("maneja primera fila sin monto y segunda con monto", () => {
      const filas: FilaParaCascada[] = [
        { idCliente: "1", monto: "" },        // 56000 (sin resultante)
        { idCliente: "1", monto: "2000.00" }, // 56000 -> 54000
      ];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].saldoAnterior).toBe("56000.00");
      expect(res[0].resultante).toBeUndefined();

      expect(res[1].saldoAnterior).toBe("56000.00");
      expect(res[1].resultante).toBe("54000.00");
      expect(res[1].montoTotalCliente).toBe("2000.00");
    });
  });

  describe("saldos que pasan a negativo / saldo a favor", () => {
    it("detecta cuando un abono único excede el saldo adeudado", () => {
      // Cliente 2 debe $1,000.00 y abona $1,500.00
      const filas: FilaParaCascada[] = [{ idCliente: "2", monto: "1500.00" }];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].saldoAnterior).toBe("1000.00");
      expect(res[0].resultante).toBe("-500.00");
      expect(res[0].superaSaldo).toBe(true);
      expect(res[0].totalSuperaSaldo).toBe(true);
      expect(res[0].saldoFinalCliente).toBe("-500.00");
    });

    it("detecta cuando el segundo abono en cascada es el que hace que el saldo pase a negativo", () => {
      // Cliente 2 debe $1,000.00. Fila 1 abona $600.00 (queda $400.00). Fila 2 abona $600.00 (queda -$200.00).
      const filas: FilaParaCascada[] = [
        { idCliente: "2", monto: "600.00" },
        { idCliente: "2", monto: "600.00" },
      ];
      const res = calcularSaldosEnCascada(filas, saldos);

      // Fila 0: aún no excede individualmente, pero el total del lote sí supera
      expect(res[0].saldoAnterior).toBe("1000.00");
      expect(res[0].resultante).toBe("400.00");
      expect(res[0].superaSaldo).toBe(false);
      expect(res[0].totalSuperaSaldo).toBe(true);

      // Fila 1: este abono empuja el saldo a negativo (-$200.00)
      expect(res[1].saldoAnterior).toBe("400.00");
      expect(res[1].resultante).toBe("-200.00");
      expect(res[1].superaSaldo).toBe(true);
      expect(res[1].totalSuperaSaldo).toBe(true);
      expect(res[1].saldoFinalCliente).toBe("-200.00");
    });

    it("no marca superaSaldo si el abono liquida exactamente la deuda a $0.00", () => {
      const filas: FilaParaCascada[] = [
        { idCliente: "2", monto: "700.00" },
        { idCliente: "2", monto: "300.00" },
      ];
      const res = calcularSaldosEnCascada(filas, saldos);

      expect(res[0].resultante).toBe("300.00");
      expect(res[0].superaSaldo).toBe(false);
      expect(res[0].totalSuperaSaldo).toBe(false);

      expect(res[1].saldoAnterior).toBe("300.00");
      expect(res[1].resultante).toBe("0.00");
      expect(res[1].superaSaldo).toBe(false);
      expect(res[1].totalSuperaSaldo).toBe(false);
      expect(res[1].saldoFinalCliente).toBe("0.00");
    });

    it("marca superaSaldo cuando el cliente ya iniciaba en cero o saldo a favor", () => {
      // Cliente 3 tiene saldo $0.00
      const resCero = calcularSaldosEnCascada([{ idCliente: "3", monto: "100.00" }], saldos);
      expect(resCero[0].saldoAnterior).toBe("0.00");
      expect(resCero[0].resultante).toBe("-100.00");
      expect(resCero[0].superaSaldo).toBe(true);
      expect(resCero[0].totalSuperaSaldo).toBe(true);

      // Cliente 4 ya tenía saldo a favor -$50.00
      const resFavor = calcularSaldosEnCascada([{ idCliente: "4", monto: "50.00" }], saldos);
      expect(resFavor[0].saldoAnterior).toBe("-50.00");
      expect(resFavor[0].resultante).toBe("-100.00");
      expect(resFavor[0].superaSaldo).toBe(true);
      expect(resFavor[0].totalSuperaSaldo).toBe(true);
    });
  });

  describe("reactividad ante modificaciones en el lote (inmutabilidad)", () => {
    it("al eliminar una fila intermedia, las filas posteriores se recalculan inmediatamente", () => {
      const loteOriginal: FilaParaCascada[] = [
        { idCliente: "1", monto: "3000.00" }, // 56000 -> 53000
        { idCliente: "1", monto: "2000.00" }, // 53000 -> 51000
        { idCliente: "1", monto: "1000.00" }, // 51000 -> 50000
      ];

      // Se elimina la fila del medio (índice 1)
      const loteTrasBorrado = [loteOriginal[0], loteOriginal[2]];
      const res = calcularSaldosEnCascada(loteTrasBorrado, saldos);

      expect(res).toHaveLength(2);
      expect(res[0].saldoAnterior).toBe("56000.00");
      expect(res[0].resultante).toBe("53000.00");
      expect(res[0].indiceEnCliente).toBe(1);
      expect(res[0].totalAbonosCliente).toBe(2);

      // La antigua fila 2 ahora es la fila 1 y deduce directo de 53,000.00
      expect(res[1].saldoAnterior).toBe("53000.00");
      expect(res[1].resultante).toBe("52000.00");
      expect(res[1].indiceEnCliente).toBe(2);
      expect(res[1].totalAbonosCliente).toBe(2);
      expect(res[1].montoTotalCliente).toBe("4000.00");
      expect(res[1].saldoFinalCliente).toBe("52000.00");
    });

    it("al editar el monto de la primera fila, las posteriores actualizan su saldo proyectado", () => {
      const loteA: FilaParaCascada[] = [
        { idCliente: "1", monto: "1000.00" },
        { idCliente: "1", monto: "500.00" },
      ];
      const resA = calcularSaldosEnCascada(loteA, saldos);
      expect(resA[1].saldoAnterior).toBe("55000.00");
      expect(resA[1].resultante).toBe("54500.00");

      // Usuario edita la primera fila a 4,000.00
      const loteB: FilaParaCascada[] = [
        { idCliente: "1", monto: "4000.00" },
        { idCliente: "1", monto: "500.00" },
      ];
      const resB = calcularSaldosEnCascada(loteB, saldos);
      expect(resB[1].saldoAnterior).toBe("52000.00");
      expect(resB[1].resultante).toBe("51500.00");
    });

    it("al cambiar el cliente de una fila, ambas cadenas de clientes se recalculan", () => {
      const loteA: FilaParaCascada[] = [
        { idCliente: "1", monto: "1000.00" },
        { idCliente: "1", monto: "500.00" },
      ];
      const resA = calcularSaldosEnCascada(loteA, saldos);
      expect(resA[0].totalAbonosCliente).toBe(2);

      // Usuario cambia la fila 1 a Cliente 2
      const loteB: FilaParaCascada[] = [
        { idCliente: "1", monto: "1000.00" },
        { idCliente: "2", monto: "500.00" },
      ];
      const resB = calcularSaldosEnCascada(loteB, saldos);
      // Cliente 1 ahora solo tiene 1 abono
      expect(resB[0].totalAbonosCliente).toBe(1);
      expect(resB[0].saldoFinalCliente).toBe("55000.00");

      // Cliente 2 tiene 1 abono partiendo de su saldo base
      expect(resB[1].saldoAnterior).toBe("1000.00");
      expect(resB[1].resultante).toBe("500.00");
      expect(resB[1].totalAbonosCliente).toBe(1);
    });
  });

  describe("reglas de dinero y precisión numérica (Regla 1)", () => {
    it("no sufre de errores clásicos de punto flotante binario (0.30 - 0.10 - 0.20 = 0.00)", () => {
      const saldosCentavos = new Map([[99, "0.30"]]);
      const filas: FilaParaCascada[] = [
        { idCliente: "99", monto: "0.10" },
        { idCliente: "99", monto: "0.20" },
      ];
      const res = calcularSaldosEnCascada(filas, saldosCentavos);

      expect(res[0].saldoAnterior).toBe("0.30");
      expect(res[0].resultante).toBe("0.20");

      expect(res[1].saldoAnterior).toBe("0.20");
      expect(res[1].resultante).toBe("0.00");
      expect(res[1].saldoFinalCliente).toBe("0.00");
      expect(res[1].superaSaldo).toBe(false);
    });

    it("maneja montos grandes con precisión estricta", () => {
      const saldosGrandes = new Map([[77, "99999999.99"]]);
      const filas: FilaParaCascada[] = [
        { idCliente: "77", monto: "50000000.00" },
        { idCliente: "77", monto: "49999999.99" },
      ];
      const res = calcularSaldosEnCascada(filas, saldosGrandes);

      expect(res[0].saldoAnterior).toBe("99999999.99");
      expect(res[0].resultante).toBe("49999999.99");

      expect(res[1].saldoAnterior).toBe("49999999.99");
      expect(res[1].resultante).toBe("0.00");
    });
  });
});
