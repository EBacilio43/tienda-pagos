import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const cookieStoreVal = new Map<string, string>();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (key: string) => (cookieStoreVal.has(key) ? { value: cookieStoreVal.get(key) } : undefined),
    set: (key: string, val: string) => cookieStoreVal.set(key, val),
    delete: (key: string) => cookieStoreVal.delete(key),
  })),
}));

import { prisma, limpiarBaseDePrueba } from "./setup";
import { listarSesionesActivas, cerrarSesion } from "@/server/services/sesiones";
import { crearSesion, leerSesion, hashToken } from "@/server/auth/session";
import { ErrorPermiso } from "@/lib/permisos";
import { TIMEOUT_INACTIVIDAD_HORAS } from "@/lib/sesion";

const ADMIN = { id: 1, rol: "admin" as const };
const CONSULTA = { id: 3, rol: "consulta" as const };

const HORA = 60 * 60 * 1000;
const hace = (ms: number) => new Date(Date.now() - ms);
const dentroDe = (ms: number) => new Date(Date.now() + ms);

async function sembrarUsuarios() {
  const base = { passwordHash: "x", intentosFallidos: 0, creadoEn: new Date() };
  await prisma.usuario.createMany({
    data: [
      { id: 1, username: "admin_t", nombreCompleto: "Admin Test", rol: "admin", activo: true, ...base },
      { id: 3, username: "consulta_t", nombreCompleto: "Consulta Test", rol: "consulta", activo: true, ...base },
      { id: 9, username: "baja_t", nombreCompleto: "Dado De Baja", rol: "operador", activo: false, ...base },
    ],
  });
}

// `token_hash` es UNIQUE; el valor no importa para estas pruebas, solo que
// no choque. Aquí nunca se pasa por hashToken() a propósito: se prueba el
// servicio de listado, no la autenticación.
let n = 0;
async function sesion(campos: {
  usuarioId: number;
  expiraEn: Date;
  ultimaActividad: Date;
}) {
  n += 1;
  return prisma.sesion.create({
    data: {
      tokenHash: `hash-de-prueba-${n}`,
      creadaEn: hace(24 * HORA),
      ...campos,
    },
  });
}

beforeEach(async () => {
  cookieStoreVal.clear();
  await limpiarBaseDePrueba();
  await sembrarUsuarios();
});

afterAll(async () => {
  await limpiarBaseDePrueba();
});

// El defecto que estas pruebas fijan: `listarSesionesActivas` era un
// findMany sin `where` y devolvía la tabla entera. Como una sesión muerta
// solo se borra si alguien vuelve a presentar su cookie —y casi nadie
// vuelve—, la pantalla "Sesiones activas" acababa listando decenas de
// filas que la autenticación ya rechazaba. Medido en desarrollo el
// 2026-09-03: 34 de 35.
describe("listarSesionesActivas", () => {
  it("lista una sesión viva", async () => {
    await sesion({ usuarioId: 1, expiraEn: dentroDe(2 * HORA), ultimaActividad: hace(5 * 60 * 1000) });

    const activas = await listarSesionesActivas();

    expect(activas).toHaveLength(1);
    expect(activas[0].username).toBe("admin_t");
  });

  it("excluye una sesión que pasó su expiración absoluta", async () => {
    await sesion({ usuarioId: 1, expiraEn: hace(1 * HORA), ultimaActividad: hace(1 * HORA) });

    expect(await listarSesionesActivas()).toHaveLength(0);
  });

  it("excluye una sesión inactiva más allá del timeout, aunque no haya expirado", async () => {
    // El caso que la expiración absoluta por sí sola no atrapa: la sesión
    // todavía tiene horas de vida nominal pero nadie la usa desde hace más
    // que la ventana de inactividad, así que `leerSesion()` la mataría.
    await sesion({
      usuarioId: 1,
      expiraEn: dentroDe(10 * HORA),
      ultimaActividad: hace((TIMEOUT_INACTIVIDAD_HORAS + 1) * HORA),
    });

    expect(await listarSesionesActivas()).toHaveLength(0);
  });

  it("excluye la sesión de un usuario desactivado", async () => {
    // `leerSesion()` corta al usuario desactivado en el siguiente request;
    // sin este filtro la pantalla lo seguía mostrando dentro.
    await sesion({ usuarioId: 9, expiraEn: dentroDe(2 * HORA), ultimaActividad: hace(60 * 1000) });

    expect(await listarSesionesActivas()).toHaveLength(0);
  });

  it("separa vivas de muertas cuando conviven", async () => {
    await sesion({ usuarioId: 1, expiraEn: dentroDe(2 * HORA), ultimaActividad: hace(60 * 1000) });
    await sesion({ usuarioId: 3, expiraEn: hace(1 * HORA), ultimaActividad: hace(3 * HORA) });
    await sesion({ usuarioId: 9, expiraEn: dentroDe(2 * HORA), ultimaActividad: hace(60 * 1000) });

    const activas = await listarSesionesActivas();

    expect(activas.map((s) => s.username)).toEqual(["admin_t"]);
    // Filtrar no es borrar: la lectura no muta la tabla. Limpiarla es
    // trabajo de scripts/podar-logs.ts.
    expect(await prisma.sesion.count()).toBe(3);
  });
});

describe("cerrarSesion", () => {
  it("un admin la borra y deja su renglón de auditoría", async () => {
    const s = await sesion({
      usuarioId: 3,
      expiraEn: dentroDe(2 * HORA),
      ultimaActividad: hace(60 * 1000),
    });

    await cerrarSesion(ADMIN, s.id);

    expect(await prisma.sesion.findUnique({ where: { id: s.id } })).toBeNull();
    const auditoria = await prisma.auditoria.findFirst({ where: { accion: "cerrar_sesion" } });
    // AGENTS.md regla 5: registro_id nunca queda null.
    expect(auditoria?.registroId).toBe(String(s.id));
    expect(auditoria?.usuarioId).toBe(ADMIN.id);
  });

  it("un rol sin permiso no puede cerrar la sesión de otro", async () => {
    const s = await sesion({
      usuarioId: 1,
      expiraEn: dentroDe(2 * HORA),
      ultimaActividad: hace(60 * 1000),
    });

    await expect(cerrarSesion(CONSULTA, s.id)).rejects.toBeInstanceOf(ErrorPermiso);
    expect(await prisma.sesion.count()).toBe(1);
  });
});

describe("crearSesion - política de sesión única activa (P17)", () => {
  it("iniciar sesión dos veces consecutivas invalida la primera y deja solo la segunda activa", async () => {
    const metaDispositivo1 = { ipAddress: "192.168.1.50", userAgent: "Navegador Movil" };
    const metaDispositivo2 = { ipAddress: "192.168.1.60", userAgent: "Navegador Escritorio" };

    // Primer login
    const token1 = await crearSesion(1, metaDispositivo1);
    const sesionesDespuesDeLogin1 = await prisma.sesion.findMany({ where: { usuarioId: 1 } });
    expect(sesionesDespuesDeLogin1).toHaveLength(1);
    expect(sesionesDespuesDeLogin1[0].tokenHash).toBe(hashToken(token1));

    // Segundo login desde otro dispositivo
    const token2 = await crearSesion(1, metaDispositivo2);
    const sesionesDespuesDeLogin2 = await prisma.sesion.findMany({ where: { usuarioId: 1 } });
    expect(sesionesDespuesDeLogin2).toHaveLength(1);
    expect(sesionesDespuesDeLogin2[0].tokenHash).toBe(hashToken(token2));
    expect(sesionesDespuesDeLogin2[0].tokenHash).not.toBe(hashToken(token1));

    // Token 1 ya no existe en la base de datos (invalidado)
    const sesionToken1 = await prisma.sesion.findUnique({ where: { tokenHash: hashToken(token1) } });
    expect(sesionToken1).toBeNull();

    // Se registró el motivo de reemplazo en sesiones_log
    const logsReemplazo = await prisma.sesionLog.findMany({
      where: { usuarioId: 1, motivoFalla: "sesion_reemplazada" },
    });
    expect(logsReemplazo).toHaveLength(1);
    expect(logsReemplazo[0].usernameIntentado).toBe("admin_t");
    expect(logsReemplazo[0].ipAddress).toBe("192.168.1.50");
    expect(logsReemplazo[0].userAgent).toBe("Navegador Movil");

    // Regla 5: Auditoría registró el reemplazo con el id de la sesión anterior
    const auditoriaReemplazo = await prisma.auditoria.findFirst({
      where: { usuarioId: 1, accion: "sesion_reemplazada" },
    });
    expect(auditoriaReemplazo).not.toBeNull();
    expect(auditoriaReemplazo?.tablaAfectada).toBe("sesiones");
    expect(auditoriaReemplazo?.registroId).toBe(String(sesionesDespuesDeLogin1[0].id));
  });

  it("iniciar sesión no afecta las sesiones activas de otros usuarios", async () => {
    // Usuario 1 y Usuario 3 inician sesión
    const tokenUser1_v1 = await crearSesion(1, { ipAddress: "10.0.0.1", userAgent: "App 1" });
    const tokenUser3 = await crearSesion(3, { ipAddress: "10.0.0.3", userAgent: "App 3" });

    expect(await prisma.sesion.count()).toBe(2);

    // Usuario 1 vuelve a iniciar sesión en otro dispositivo
    const tokenUser1_v2 = await crearSesion(1, { ipAddress: "10.0.0.2", userAgent: "App 2" });

    // La sesión del Usuario 3 sigue intacta y válida
    const sesionUser3 = await prisma.sesion.findUnique({
      where: { tokenHash: hashToken(tokenUser3) },
    });
    expect(sesionUser3).not.toBeNull();
    expect(sesionUser3?.usuarioId).toBe(3);

    // Usuario 1 solo tiene la nueva sesión activa
    const sesionUser1Vieja = await prisma.sesion.findUnique({
      where: { tokenHash: hashToken(tokenUser1_v1) },
    });
    expect(sesionUser1Vieja).toBeNull();

    const sesionUser1Nueva = await prisma.sesion.findUnique({
      where: { tokenHash: hashToken(tokenUser1_v2) },
    });
    expect(sesionUser1Nueva).not.toBeNull();
    expect(sesionUser1Nueva?.usuarioId).toBe(1);

    // Total de sesiones activas en la BD sigue siendo 2 (1 por cada usuario)
    expect(await prisma.sesion.count()).toBe(2);
  });

  it("en la siguiente petición HTTP, leerSesion rechaza el token previo invalidado", async () => {
    // 1. Usuario inicia sesión en Navegador A
    const tokenA = await crearSesion(1, { ipAddress: "1.1.1.1", userAgent: "Navegador A" });
    cookieStoreVal.set("sesion", tokenA);

    const usuarioAutenticadoA = await leerSesion();
    expect(usuarioAutenticadoA).not.toBeNull();
    expect(usuarioAutenticadoA?.id).toBe(1);

    // 2. Usuario inicia sesión en Navegador B (invalida la sesión anterior)
    const tokenB = await crearSesion(1, { ipAddress: "2.2.2.2", userAgent: "Navegador B" });

    // 3. Navegador B funciona y lee la sesión correctamente
    cookieStoreVal.set("sesion", tokenB);
    const usuarioAutenticadoB = await leerSesion();
    expect(usuarioAutenticadoB).not.toBeNull();
    expect(usuarioAutenticadoB?.id).toBe(1);

    // 4. Navegador A hace una petición con su cookie vieja (tokenA) -> rechazada (null)
    cookieStoreVal.set("sesion", tokenA);
    const intentoNavegadorA = await leerSesion();
    expect(intentoNavegadorA).toBeNull();
  });
});

