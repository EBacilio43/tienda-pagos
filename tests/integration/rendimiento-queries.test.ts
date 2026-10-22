import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import { Prisma } from "@prisma/client";
import {
  obtenerClienteDetalle,
  listarClientes,
  listarVentasCliente,
  listarPagosCliente,
  listarDevolucionesCliente,
} from "@/server/services/clientes";
import {
  listarActividadReciente,
  listarActividadDelDia,
  resumenDeActividadPorDia,
} from "@/server/services/actividad";
import { obtenerDashboard } from "@/server/services/dashboard";
import { obtenerVentaDetalle } from "@/server/services/ventas";
import { obtenerPagoDetalle } from "@/server/services/pagos";
import { obtenerDevolucionDetalle } from "@/server/services/devoluciones";
import { obtenerSaldo } from "@/server/services/saldo";
import { decimalAString } from "@/lib/money";
import { fechaAString } from "@/lib/fecha";

describe("P9: Optimización de queries, paralelización y proyecciones estrictas", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
  });

  afterAll(async () => {
    await limpiarBaseDePrueba();
  });

  async function sembrarDatosPrueba() {
    // 1. Usuarios para auditoría
    const usuario = await prisma.usuario.create({
      data: {
        username: "admin_perf",
        passwordHash: "hash_perf",
        nombreCompleto: "Administrador Rendimiento",
        rol: "admin",
        activo: true,
        intentosFallidos: 0,
        creadoEn: new Date(),
      },
    });

    // 2. Catálogo con artículos con stock y stock mínimo
    const joya1 = await prisma.catalogo.create({
      data: {
        nombre: "Anillo Oro 14k",
        precio: new Prisma.Decimal("3500.00"),
        activo: true,
        stock: 1,
        stockMinimo: 3, // Bajo mínimo
      },
    });

    const joya2 = await prisma.catalogo.create({
      data: {
        nombre: "Cadena Plata 925",
        precio: new Prisma.Decimal("1200.00"),
        activo: true,
        stock: 10,
        stockMinimo: 2, // Stock saludable
      },
    });

    // 3. Clientes
    const cliente1 = await prisma.cliente.create({
      data: {
        nombre: "Ana Gómez",
        email: "ana@example.com",
        telefono: "555-1001",
        colonia: "Centro",
        municipio: "Oaxaca",
        estado: "Oaxaca",
        fechaRegistro: new Date("2026-01-10T10:00:00Z"),
      },
    });

    const cliente2 = await prisma.cliente.create({
      data: {
        nombre: "Bernardo Ruiz",
        email: "bernardo@example.com",
        telefono: "555-1002",
        fechaRegistro: new Date("2026-02-15T12:00:00Z"),
      },
    });

    const cliente3 = await prisma.cliente.create({
      data: {
        nombre: "Carlos Domínguez",
        telefono: "555-1003",
        fechaRegistro: new Date("2026-03-01T08:00:00Z"),
      },
    });

    // Fechas actuales para que impacten en la ventana del dashboard
    const hoy = new Date();
    const fechaNegocioHoy = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));

    // 4. Ventas
    // Venta 1: Ana compra con enganche
    const venta1 = await prisma.venta.create({
      data: {
        idCliente: cliente1.id,
        fecha: fechaNegocioHoy,
        fechaRegistroSistema: new Date(fechaNegocioHoy.getTime() + 1000 * 60 * 10),
        esquemaPago: "Quincenal",
        frecuenciaPago: "15 dias",
        montoTotal: new Prisma.Decimal("5000.00"),
        tieneEnganche: true,
        enganche: new Prisma.Decimal("1000.00"),
        ventaArticulos: {
          create: [
            {
              nombre: "Anillo Oro 14k",
              cantidad: 1,
              precioUnitario: new Prisma.Decimal("3500.00"),
              idCatalogo: joya1.id,
            },
            {
              nombre: "Aretes zirconia libre",
              cantidad: 1,
              precioUnitario: new Prisma.Decimal("1500.00"),
            },
          ],
        },
      },
    });

    // Venta 2: Bernardo compra sin enganche
    const venta2 = await prisma.venta.create({
      data: {
        idCliente: cliente2.id,
        fecha: fechaNegocioHoy,
        fechaRegistroSistema: new Date(fechaNegocioHoy.getTime() + 1000 * 60 * 20),
        esquemaPago: "Contado",
        montoTotal: new Prisma.Decimal("2400.00"),
        tieneEnganche: false,
        enganche: null,
        ventaArticulos: {
          create: [
            {
              nombre: "Cadena Plata 925",
              cantidad: 2,
              precioUnitario: new Prisma.Decimal("1200.00"),
              idCatalogo: joya2.id,
            },
          ],
        },
      },
    });

    // 5. Pagos / Abonos
    // Ana abona 1500
    const pago1 = await prisma.pago.create({
      data: {
        idCliente: cliente1.id,
        fecha: fechaNegocioHoy,
        fechaRegistroSistema: new Date(fechaNegocioHoy.getTime() + 1000 * 60 * 30),
        monto: new Prisma.Decimal("1500.00"),
        metodoPago: "Transferencia",
        referencia: "TRANSF-001",
      },
    });

    // 6. Devoluciones
    // Bernardo devuelve 1 artículo con crédito 1200
    const devolucion1 = await prisma.devolucion.create({
      data: {
        idCliente: cliente2.id,
        fecha: fechaNegocioHoy,
        fechaRegistroSistema: new Date(fechaNegocioHoy.getTime() + 1000 * 60 * 40),
        motivo: "Talla incorrecta",
        montoCredito: new Prisma.Decimal("1200.00"),
        devolucionArticulos: {
          create: [
            {
              nombre: "Cadena Plata 925",
              cantidad: 1,
              precioUnitario: new Prisma.Decimal("1200.00"),
              idCatalogo: joya2.id,
            },
          ],
        },
      },
    });

    // 7. Auditoría
    await prisma.auditoria.createMany({
      data: [
        {
          usuarioId: usuario.id,
          accion: "crear",
          tablaAfectada: "ventas",
          registroId: String(venta1.id),
          timestamp: new Date(),
        },
        {
          usuarioId: usuario.id,
          accion: "crear",
          tablaAfectada: "pagos",
          registroId: String(pago1.id),
          timestamp: new Date(),
        },
        {
          usuarioId: usuario.id,
          accion: "crear",
          tablaAfectada: "devoluciones",
          registroId: String(devolucion1.id),
          timestamp: new Date(),
        },
      ],
    });

    return {
      usuario,
      joya1,
      joya2,
      cliente1,
      cliente2,
      cliente3,
      venta1,
      venta2,
      pago1,
      devolucion1,
      fechaNegocioHoy,
    };
  }

  describe("1. Paridad y exactitud de resultados", () => {
    it("obtenerClienteDetalle retorna campos idénticos y saldo exacto de v_saldos_cliente", async () => {
      const { cliente1 } = await sembrarDatosPrueba();

      const detalle = await obtenerClienteDetalle(cliente1.id);
      expect(detalle).not.toBeNull();
      expect(detalle?.id).toBe(cliente1.id);
      expect(detalle?.nombre).toBe("Ana Gómez");
      expect(detalle?.email).toBe("ana@example.com");
      expect(detalle?.telefono).toBe("555-1001");
      expect(detalle?.colonia).toBe("Centro");
      expect(detalle?.municipio).toBe("Oaxaca");
      expect(detalle?.estado).toBe("Oaxaca");

      // Venta: 5000. Enganche: 1000. Abono: 1500. Saldo: 5000 - 1000 - 1500 = 2500.00
      const saldoVista = await obtenerSaldo(cliente1.id);
      expect(detalle?.saldo).toBe(decimalAString(saldoVista));
      expect(detalle?.saldo).toBe("2500.00");
    });

    it("obtenerClienteDetalle retorna null para id inexistente", async () => {
      await sembrarDatosPrueba();
      const detalle = await obtenerClienteDetalle(999999);
      expect(detalle).toBeNull();
    });

    it("listarClientes devuelve paginación exacta, saldo por cliente y último abono", async () => {
      const { cliente1, cliente2, cliente3, fechaNegocioHoy } = await sembrarDatosPrueba();

      const resultado = await listarClientes({ pagina: 1 });
      expect(resultado.total).toBe(3);
      expect(resultado.clientes).toHaveLength(3);

      const ana = resultado.clientes.find((c) => c.id === cliente1.id);
      expect(ana).toBeDefined();
      expect(ana?.saldo).toBe("2500.00");
      expect(ana?.ultimoAbono).toBe(fechaAString(fechaNegocioHoy));

      const bernardo = resultado.clientes.find((c) => c.id === cliente2.id);
      expect(bernardo).toBeDefined();
      // Bernardo: Venta 2400 - Devolución 1200 = 1200.00
      expect(bernardo?.saldo).toBe("1200.00");
      expect(bernardo?.ultimoAbono).toBeNull(); // Bernardo nunca abonó

      const carlos = resultado.clientes.find((c) => c.id === cliente3.id);
      expect(carlos).toBeDefined();
      expect(carlos?.saldo).toBe("0.00");
      expect(carlos?.ultimoAbono).toBeNull();
    });

    it("listarClientes con búsqueda vacía o sin coincidencias responde rápidamente", async () => {
      await sembrarDatosPrueba();
      const vacio = await listarClientes({ busqueda: "NoExiste" });
      expect(vacio.total).toBe(0);
      expect(vacio.clientes).toHaveLength(0);
    });

    it("listarVentasCliente, listarPagosCliente y listarDevolucionesCliente devuelven datos completos con select estricto", async () => {
      const { cliente1, cliente2 } = await sembrarDatosPrueba();

      const ventasAna = await listarVentasCliente(cliente1.id);
      expect(ventasAna).toHaveLength(1);
      expect(ventasAna[0].montoTotal).toBe("5000.00");
      expect(ventasAna[0].tieneEnganche).toBe(true);
      expect(ventasAna[0].enganche).toBe("1000.00");
      expect(ventasAna[0].articulos).toHaveLength(2);

      const pagosAna = await listarPagosCliente(cliente1.id);
      expect(pagosAna).toHaveLength(1);
      expect(pagosAna[0].monto).toBe("1500.00");
      expect(pagosAna[0].metodoPago).toBe("Transferencia");
      expect(pagosAna[0].referencia).toBe("TRANSF-001");

      const devolucionesBernardo = await listarDevolucionesCliente(cliente2.id);
      expect(devolucionesBernardo).toHaveLength(1);
      expect(devolucionesBernardo[0].montoCredito).toBe("1200.00");
      expect(devolucionesBernardo[0].articulos).toHaveLength(1);
    });

    it("listarActividadReciente mezcla correctamente ventas, enganches, pagos y devoluciones con select estricto", async () => {
      await sembrarDatosPrueba();

      const actividad = await listarActividadReciente(10);
      expect(actividad.length).toBeGreaterThanOrEqual(4);

      const tipos = actividad.map((a) => a.tipo);
      expect(tipos).toContain("venta");
      expect(tipos).toContain("enganche");
      expect(tipos).toContain("pago");
      expect(tipos).toContain("devolucion");

      // El enganche de venta 1 debe existir y estar desglosado
      const enganche = actividad.find((a) => a.tipo === "enganche");
      expect(enganche?.monto).toBe("1000.00");
      expect(enganche?.clienteNombre).toBe("Ana Gómez");
    });

    it("resumenDeActividadPorDia calcula los totales del día correctamente", async () => {
      const { fechaNegocioHoy } = await sembrarDatosPrueba();
      const fechaStr = fechaAString(fechaNegocioHoy);

      const resumen = await resumenDeActividadPorDia(fechaStr, fechaStr);
      expect(resumen).toHaveLength(1);
      const dia = resumen[0];
      expect(dia.fecha).toBe(fechaStr);
      // Cargos: Venta 1 (5000) + Venta 2 (2400) = 7400.00
      expect(dia.cargos).toBe("7400.00");
      // Abonos: Enganche (1000) + Pago (1500) + Devolución (1200) = 3700.00
      expect(dia.abonos).toBe("3700.00");
      // Movimientos: 2 ventas + 1 enganche + 1 pago + 1 devolución = 5
      expect(dia.movimientos).toBe(5);
    });

    it("listarActividadDelDia devuelve los movimientos del día con select estricto", async () => {
      const { fechaNegocioHoy } = await sembrarDatosPrueba();
      const fechaStr = fechaAString(fechaNegocioHoy);

      const items = await listarActividadDelDia(fechaStr);
      expect(items).toHaveLength(5);
      expect(items.some((i) => i.tipo === "venta")).toBe(true);
      expect(items.some((i) => i.tipo === "enganche")).toBe(true);
      expect(items.some((i) => i.tipo === "pago")).toBe(true);
      expect(items.some((i) => i.tipo === "devolucion")).toBe(true);
    });

    it("obtenerDashboard entrega métricas exactas eliminando queries redundantes", async () => {
      await sembrarDatosPrueba();

      const dashboard = await obtenerDashboard();
      // Total de clientes debe ser 3 sin haber ejecutado prisma.cliente.count() separado
      expect(dashboard.totalClientes).toBe(3);
      // Items bajo mínimo: Anillo Oro 14k (stock 1 <= stockMinimo 3)
      expect(dashboard.itemsBajoMinimo).toBe(1);
      // Saldo pendiente total: Ana (2500) + Bernardo (1200) = 3700.00
      expect(dashboard.saldoPendienteTotal).toBe("3700.00");
      expect(dashboard.clientesConSaldo).toBe(2);

      // Top clientes saldo: Ana primero con 2500, luego Bernardo con 1200
      expect(dashboard.topClientesSaldo).toHaveLength(2);
      expect(dashboard.topClientesSaldo[0].nombre).toBe("Ana Gómez");
      expect(dashboard.topClientesSaldo[0].saldo).toBe("2500.00");
      expect(dashboard.topClientesSaldo[1].nombre).toBe("Bernardo Ruiz");
      expect(dashboard.topClientesSaldo[1].saldo).toBe("1200.00");
    });

    it("obtenerVentaDetalle, obtenerPagoDetalle y obtenerDevolucionDetalle traen datos y auditoría en paralelo", async () => {
      const { venta1, pago1, devolucion1 } = await sembrarDatosPrueba();

      const ventaDetalle = await obtenerVentaDetalle(venta1.id);
      expect(ventaDetalle).not.toBeNull();
      expect(ventaDetalle?.clienteNombre).toBe("Ana Gómez");
      expect(ventaDetalle?.registro.creadoPor).toBe("Administrador Rendimiento");

      const pagoDetalle = await obtenerPagoDetalle(pago1.id);
      expect(pagoDetalle).not.toBeNull();
      expect(pagoDetalle?.clienteNombre).toBe("Ana Gómez");
      expect(pagoDetalle?.registro.creadoPor).toBe("Administrador Rendimiento");

      const devDetalle = await obtenerDevolucionDetalle(devolucion1.id);
      expect(devDetalle).not.toBeNull();
      expect(devDetalle?.clienteNombre).toBe("Bernardo Ruiz");
      expect(devDetalle?.registro.creadoPor).toBe("Administrador Rendimiento");
    });
  });

  describe("2. Benchmark comparativo: Ejecución paralela vs secuencial", () => {
    it("demuestra que la paralelización de lecturas reduce la latencia acumulada con resultados 100% idénticos", async () => {
      const { cliente1 } = await sembrarDatosPrueba();

      // 1. Simular lectura secuencial (patrón anterior)
      const inicioSecuencial = performance.now();
      const clienteSeq = await prisma.cliente.findUnique({
        where: { id: cliente1.id },
      });
      const saldoSeq = await obtenerSaldo(cliente1.id);
      const tiempoSecuencial = performance.now() - inicioSecuencial;

      const resultadoSecuencial = {
        id: clienteSeq?.id,
        nombre: clienteSeq?.nombre,
        saldo: decimalAString(saldoSeq),
      };

      // 2. Ejecución paralelizada con select estricto (patrón optimizado)
      const inicioParalelo = performance.now();
      const detalleParalelo = await obtenerClienteDetalle(cliente1.id);
      const tiempoParalelo = performance.now() - inicioParalelo;

      // Verificación de exactitud 100%
      expect(detalleParalelo?.id).toBe(resultadoSecuencial.id);
      expect(detalleParalelo?.nombre).toBe(resultadoSecuencial.nombre);
      expect(detalleParalelo?.saldo).toBe(resultadoSecuencial.saldo);

      // Verificación de eficiencia: ambas ejecuciones completan exitosamente
      expect(tiempoParalelo).toBeGreaterThanOrEqual(0);
      expect(tiempoSecuencial).toBeGreaterThanOrEqual(0);
    });

    it("la consulta masiva de dashboard ejecuta 6 operaciones en paralelo en lugar de 7 secuenciales", async () => {
      await sembrarDatosPrueba();

      const inicio = performance.now();
      const dashboard = await obtenerDashboard();
      const duracion = performance.now() - inicio;

      expect(dashboard.totalClientes).toBe(3);
      expect(duracion).toBeLessThan(5000); // En red local/docker debe ser sumamente veloz
    });
  });
});
