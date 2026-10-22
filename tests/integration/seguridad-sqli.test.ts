import { describe, it, expect, beforeEach } from "vitest";
import { prisma, limpiarBaseDePrueba } from "./setup";
import {
  listarClientes,
  obtenerClienteDetalle,
  crearCliente,
  actualizarCliente,
  listarVentasCliente,
} from "@/server/services/clientes";
import { buscarPagosDuplicados } from "@/server/services/pagos";
import { obtenerRegistroDeAuditoria } from "@/server/services/auditoria";
import { esquemaCliente } from "@/lib/schemas/cliente";

const ADMIN = { id: 1, rol: "admin" as const };

async function sembrarDatosPrueba() {
  // Usuario admin para cumplir con la FK de auditoría en mutaciones (regla 5)
  await prisma.usuario.create({
    data: {
      id: 1,
      username: "admin_seguridad",
      nombreCompleto: "Administrador de Pruebas",
      rol: "admin",
      passwordHash: "hash_inofensivo_para_pruebas",
      activo: true,
      intentosFallidos: 0,
      creadoEn: new Date(),
    },
  });

  // Clientes estándar para probar que las búsquedas no filtren filas indebidas
  const c1 = await prisma.cliente.create({
    data: {
      nombre: "Ana Gómez",
      email: "ana.gomez@ejemplo.com",
      telefono: "5551112233",
      empresa: "Joyería Central",
      calle: "Av. Principal",
      numExt: "100",
      colonia: "Centro",
      cp: "06000",
      fechaRegistro: new Date("2026-01-10T00:00:00Z"),
    },
  });

  const c2 = await prisma.cliente.create({
    data: {
      nombre: "Bernardo Silva",
      email: "bernardo.silva@ejemplo.com",
      telefono: "5552223344",
      empresa: "Distribuidora del Norte",
      calle: "Calle Reforma",
      numExt: "250",
      colonia: "Juárez",
      cp: "06600",
      fechaRegistro: new Date("2026-01-15T00:00:00Z"),
    },
  });

  const c3 = await prisma.cliente.create({
    data: {
      nombre: "Carlos D'Angelo O'Connor",
      email: "dangelo@ejemplo.com",
      telefono: "5553334455",
      calle: "Paseo de la Montaña",
      numExt: "42",
      fechaRegistro: new Date("2026-01-20T00:00:00Z"),
    },
  });

  const c4 = await prisma.cliente.create({
    data: {
      nombre: "Joyería 100%_Oro\\Plata",
      empresa: "Metales & Kilates",
      calle: "Callejon 5\\A",
      fechaRegistro: new Date("2026-01-25T00:00:00Z"),
    },
  });

  // Venta y pago asociados a c1 para verificar que ataques stacked no borren ni alteren tablas
  const v1 = await prisma.venta.create({
    data: {
      idCliente: c1.id,
      fecha: new Date("2026-02-01T00:00:00Z"),
      montoTotal: "1500.00",
      esquemaPago: "Contado",
      fechaRegistroSistema: new Date(),
      ventaArticulos: {
        create: [
          {
            nombre: "Anillo de Oro 14k",
            cantidad: 1,
            precioUnitario: "1500.00",
          },
        ],
      },
    },
  });

  const p1 = await prisma.pago.create({
    data: {
      idCliente: c1.id,
      fecha: new Date("2026-02-05T00:00:00Z"),
      monto: "500.00",
      metodoPago: "Efectivo",
      fechaRegistroSistema: new Date(),
    },
  });

  return { c1, c2, c3, c4, v1, p1 };
}

describe("Seguridad: blindaje contra SQL Injection (TODO P14)", () => {
  beforeEach(async () => {
    await limpiarBaseDePrueba();
    await sembrarDatosPrueba();
  });

  describe("1. Inyecciones booleanas y tautologías en filtros de búsqueda (listarClientes)", () => {
    it("la tautología clásica '' OR '1'='1' no devuelve todos los clientes ni altera el resultado", async () => {
      const res = await listarClientes({ busqueda: "' OR '1'='1" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);
    });

    it("la tautología con comentario '' OR 1=1 -- no elude la cláusula WHERE", async () => {
      const res = await listarClientes({ busqueda: "' OR 1=1 --" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);
    });

    it("la tautología con comillas dobles \" OR \"1\"=\"1\" se procesa como texto literal", async () => {
      const res = await listarClientes({ busqueda: '" OR "1"="1' });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);
    });

    it("inyección con comentario de prefijo admin' -- devuelve 0 resultados", async () => {
      const res = await listarClientes({ busqueda: "admin' --" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);
    });

    it("inyección con agrupamiento de paréntesis ') OR ('a'='a no rompe la consulta", async () => {
      const res = await listarClientes({ busqueda: "') OR ('a'='a" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);
    });
  });

  describe("2. Inyecciones destructivas y sentencias apiladas (Stacked Queries)", () => {
    it("intento de inyección '; DROP TABLE pagos; --' no ejecuta el DROP ni genera error SQL", async () => {
      const res = await listarClientes({ busqueda: "'; DROP TABLE pagos; --" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);

      // Verificar que la tabla pagos y sus datos permanezcan intactos
      const conteoPagos = await prisma.pago.count();
      expect(conteoPagos).toBe(1);
    });

    it("intento de inyección '; DELETE FROM clientes; --' no borra registros", async () => {
      const res = await listarClientes({ busqueda: "'; DELETE FROM clientes; --" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);

      // Verificar que los 4 clientes sigan en la base
      const conteoClientes = await prisma.cliente.count();
      expect(conteoClientes).toBe(4);
    });

    it("intento de inyección '; TRUNCATE TABLE ventas CASCADE; --' no borra transacciones", async () => {
      const res = await listarClientes({ busqueda: "'; TRUNCATE TABLE ventas CASCADE; --" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);

      const conteoVentas = await prisma.venta.count();
      expect(conteoVentas).toBe(1);
    });
  });

  describe("3. Inyecciones de extracción de datos (UNION SELECT)", () => {
    it("payload ' UNION SELECT null, null, null -- no arroja error ni filtra columnas", async () => {
      const res = await listarClientes({ busqueda: "' UNION SELECT null, null, null --" });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);
    });

    it("intento de exfiltrar credenciales de usuarios mediante UNION SELECT devuelve lista vacía", async () => {
      const payload = "' UNION SELECT id, username, password_hash, rol, activo, null, null, null, null, null, null, null, null, null FROM usuarios --";
      const res = await listarClientes({ busqueda: payload });

      expect(res.total).toBe(0);
      expect(res.clientes).toHaveLength(0);
    });
  });

  describe("4. Caracteres de escape y comodines SQL (\\, %, _)", () => {
    it("el caracter de escape backslash (\\) al final no provoca error de sintaxis SQL", async () => {
      // En consultas vulnerables concatenadas, un backslash al final escapa la comilla de cierre SQL generando un error de sintaxis
      const res = await listarClientes({ busqueda: "\\" });

      expect(res).toBeDefined();
      expect(typeof res.total).toBe("number");
      expect(Array.isArray(res.clientes)).toBe(true);
    });

    it("doble backslash (\\\\) se evalúa limpiamente sin romper la consulta", async () => {
      const res = await listarClientes({ busqueda: "\\\\" });

      expect(res).toBeDefined();
      expect(typeof res.total).toBe("number");
    });

    it("el comodín de porcentaje (%) no rompe la consulta y encuentra texto que lo contiene literalmente", async () => {
      const res = await listarClientes({ busqueda: "100%" });

      expect(res.total).toBe(1);
      expect(res.clientes[0].nombre).toBe("Joyería 100%_Oro\\Plata");
    });

    it("el comodín de guión bajo (_) no rompe la consulta y encuentra coincidencias", async () => {
      const res = await listarClientes({ busqueda: "_Oro" });

      expect(res.total).toBe(1);
      expect(res.clientes[0].nombre).toBe("Joyería 100%_Oro\\Plata");
    });

    it("apóstrofes legítimos (nombres como O'Connor) se buscan sin error de comilla no cerrada", async () => {
      const res = await listarClientes({ busqueda: "O'Connor" });

      expect(res.total).toBe(1);
      expect(res.clientes[0].nombre).toBe("Carlos D'Angelo O'Connor");
    });

    it("un apóstrofe suelto (') se busca como caracter literal sin error unterminated quoted string", async () => {
      const res = await listarClientes({ busqueda: "'" });

      // Solo Carlos D'Angelo O'Connor contiene apóstrofe
      expect(res.total).toBe(1);
      expect(res.clientes[0].nombre).toBe("Carlos D'Angelo O'Connor");
    });
  });

  describe("5. Inyecciones basadas en tiempo (Time-based Blind SQLi)", () => {
    it("intento de inyección '; SELECT pg_sleep(3); --' no retrasa la ejecución", async () => {
      const inicio = Date.now();
      const res = await listarClientes({ busqueda: "'; SELECT pg_sleep(3); --" });
      const transcurrido = Date.now() - inicio;

      expect(res.total).toBe(0);
      // Si se ejecutara pg_sleep(3), duraría > 3000 ms. Con parametrización debe durar < 1500 ms.
      expect(transcurrido).toBeLessThan(2000);
    });

    it("intento de inyección con función en expresión booleana ' OR pg_sleep(3) IS NULL -- no duerme", async () => {
      const inicio = Date.now();
      const res = await listarClientes({ busqueda: "' OR pg_sleep(3) IS NULL --" });
      const transcurrido = Date.now() - inicio;

      expect(res.total).toBe(0);
      expect(transcurrido).toBeLessThan(2000);
    });
  });

  describe("6. Blindaje en inserción, persistencia y edición con cargas útiles SQL (Stored SQLi)", () => {
    it("crear y consultar un cliente con payload SQL en su nombre y campos almacena el texto literal sin ejecutar comandos", async () => {
      const payloadNombre = "Roberto'); DROP TABLE ventas;--";
      const payloadCalle = "Calle Falsa ' OR '1'='1";
      const payloadEmpresa = "Empresa; DELETE FROM pagos;";

      const { id } = await crearCliente(
        ADMIN,
        esquemaCliente.parse({
          nombre: payloadNombre,
          calle: payloadCalle,
          empresa: payloadEmpresa,
        })
      );

      // Leer detalle del cliente creado
      const detalle = await obtenerClienteDetalle(id);
      expect(detalle).not.toBeNull();
      expect(detalle?.nombre).toBe(payloadNombre);
      expect(detalle?.calle).toBe(payloadCalle);
      expect(detalle?.empresa).toBe(payloadEmpresa);

      // Tablas relacionales no fueron afectadas
      expect(await prisma.venta.count()).toBe(1);
      expect(await prisma.pago.count()).toBe(1);
      expect(await prisma.cliente.count()).toBe(5);

      // Buscar al cliente por parte de su payload literal
      const resBusqueda = await listarClientes({ busqueda: "Roberto');" });
      expect(resBusqueda.total).toBe(1);
      expect(resBusqueda.clientes[0].id).toBe(id);
      expect(resBusqueda.clientes[0].nombre).toBe(payloadNombre);
    });

    it("actualizar un cliente con payload SQL preserva integridad sin ejecución arbitraria", async () => {
      const clienteOriginal = await prisma.cliente.findFirstOrThrow({ where: { nombre: "Ana Gómez" } });

      const nuevoNombre = "Ana Modificada' UNION SELECT 1, 2, 3--";
      await actualizarCliente(
        ADMIN,
        clienteOriginal.id,
        esquemaCliente.parse({
          nombre: nuevoNombre,
        })
      );

      const actualizado = await obtenerClienteDetalle(clienteOriginal.id);
      expect(actualizado?.nombre).toBe(nuevoNombre);

      // Búsqueda del nuevo nombre
      const resBusqueda = await listarClientes({ busqueda: "Ana Modificada'" });
      expect(resBusqueda.total).toBe(1);
      expect(resBusqueda.clientes[0].nombre).toBe(nuevoNombre);
    });
  });

  describe("7. Blindaje en otros servicios y endpoints", () => {
    it("obtenerRegistroDeAuditoria maneja cadenas maliciosas en tablaAfectada como valor literal inofensivo", async () => {
      const res1 = await obtenerRegistroDeAuditoria("ventas' OR '1'='1", 1);
      expect(res1.creadoPor).toBeNull();
      expect(res1.creadoEl).toBeNull();

      const res2 = await obtenerRegistroDeAuditoria("'; DROP TABLE auditoria; --", 1);
      expect(res2.creadoPor).toBeNull();

      // La tabla auditoria sigue viva
      expect(await prisma.auditoria.count()).toBeDefined();
    });

    it("buscarPagosDuplicados maneja entradas con sintaxis SQL sin alterar la consulta ni fallar", async () => {
      const candidatos = [
        { idCliente: 1, fecha: "2026-02-05", monto: "500.00" },
        { idCliente: 1, fecha: "2026-02-05' OR '1'='1", monto: "500.00" },
      ];

      // La segunda fecha es sintácticamente inválida como fecha ISO pero no debe inyectar SQL
      // El servicio la procesa con Date parsing seguro
      const duplicados = await buscarPagosDuplicados(candidatos);
      expect(duplicados.has("1|2026-02-05|500.00")).toBe(true);
    });

    it("listarVentasCliente con IDs no existentes o negativos devuelve arreglo vacío sin error SQL", async () => {
      const res = await listarVentasCliente(-999);
      expect(res).toEqual([]);
    });
  });

  describe("8. Verificación directa de parametrización nativa en $queryRaw y Prisma.sql", () => {
    it("el tag template $queryRaw parametriza automáticamente cadenas evitando inyección SQL", async () => {
      const payloadInyeccion = "' OR '1'='1";

      // Si $queryRaw interpolara strings crudos, esta query devolvería los 4 clientes
      // Al parametrizar como $1, solo busca la coincidencia exacta literal
      const filas = await prisma.$queryRaw<{ id: number; nombre: string }[]>`
        SELECT id, nombre FROM clientes WHERE nombre = ${payloadInyeccion}
      `;

      expect(filas).toHaveLength(0);
    });

    it("si un cliente tiene el nombre literal '' OR '1'='1', $queryRaw lo localiza exactamente por parametrización", async () => {
      const literal = "' OR '1'='1";
      const nuevo = await prisma.cliente.create({
        data: { nombre: literal },
      });

      const filas = await prisma.$queryRaw<{ id: number; nombre: string }[]>`
        SELECT id, nombre FROM clientes WHERE nombre = ${literal}
      `;

      expect(filas).toHaveLength(1);
      expect(filas[0].id).toBe(nuevo.id);
      expect(filas[0].nombre).toBe(literal);
    });
  });
});
