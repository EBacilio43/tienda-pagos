import { describe, it, expect, beforeEach, vi } from "vitest";

// `next/headers` no existe fuera de un request de Next, y todo el camino de
// sesión pasa por él. El frasco de galletas es un Map: lo que importa de
// una cookie aquí es que `crearSesion` la escriba y `leerSesion` la lea, no
// cómo la serializa Next. `vi.hoisted` porque `vi.mock` se iza por encima
// de las declaraciones del módulo.
const frasco = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "user-agent": "vitest",
      "x-forwarded-for": "203.0.113.10",
    }),
  cookies: async () => ({
    get: (nombre: string) =>
      frasco.has(nombre) ? { name: nombre, value: frasco.get(nombre)! } : undefined,
    set: (nombre: string, valor: string) => {
      frasco.set(nombre, valor);
    },
    delete: (nombre: string) => {
      frasco.delete(nombre);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { prisma, limpiarBaseDePrueba } from "./setup";
import { autenticar } from "@/server/auth/autenticar";
import {
  registrarIntentoFallido,
  registrarLoginExitoso,
  estaBloqueado,
  MAX_INTENTOS_FALLIDOS,
  MINUTOS_BLOQUEO,
} from "@/server/auth/lockout";
import { ipBloqueada, MAX_INTENTOS_POR_IP, MINUTOS_VENTANA_IP } from "@/server/auth/rate-limit-ip";
import { leerSesion, crearSesion, destruirSesionActual } from "@/server/auth/session";
import {
  resetearPassword,
  cambiarPasswordPropia,
  cambiarContrasena,
  actualizarUsuario,
} from "@/server/services/usuarios";
import { loginAction } from "@/server/actions/sesiones";
import { hashearPassword } from "@/server/auth/password";
import { DURACION_ABSOLUTA_HORAS, TIMEOUT_INACTIVIDAD_HORAS } from "@/lib/sesion";

// Cobertura de seguridad: autenticar, lockout, rate-limit-ip y session
// para garantizar proteccion contra fuerza bruta y control de estado de sesiones.

const PASSWORD = "Correcta123!";
const IP = "203.0.113.10";
const meta = { ipAddress: IP, userAgent: "vitest" };

async function crearUsuario(
  username: string,
  extra: { activo?: boolean; rol?: string } = {}
) {
  return prisma.usuario.create({
    data: {
      username,
      passwordHash: await hashearPassword(PASSWORD),
      nombreCompleto: `Usuario ${username}`,
      rol: extra.rol ?? "admin",
      activo: extra.activo ?? true,
      intentosFallidos: 0,
      creadoEn: new Date(),
    },
  });
}

beforeEach(async () => {
  await limpiarBaseDePrueba();
  frasco.clear();
});

describe("lockout por cuenta", () => {
  it("bloquea exactamente en el intento número MAX, ni antes ni después", async () => {
    const usuario = await crearUsuario("lockout1");

    for (let i = 1; i < MAX_INTENTOS_FALLIDOS; i++) {
      const r = await registrarIntentoFallido(await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } }));
      expect(r.intentosFallidos).toBe(i);
      expect(r.bloqueado).toBe(false);
    }

    const ultimo = await registrarIntentoFallido(
      await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    );
    expect(ultimo.intentosFallidos).toBe(MAX_INTENTOS_FALLIDOS);
    expect(ultimo.bloqueado).toBe(true);

    const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(estaBloqueado(guardado)).toBe(true);
  });

  // El defecto legacy (models.py:177-180): `intentos_fallidos` no se
  // reseteaba al expirar el bloqueo, así que UN intento después de la
  // ventana volvía a bloquear — un trinquete de 1 intento cada 15 min para
  // siempre. Es la razón de ser del updateMany condicional.
  it("al expirar el bloqueo, el contador vuelve a cero en vez de re-bloquear", async () => {
    const usuario = await crearUsuario("lockout2");
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosFallidos: MAX_INTENTOS_FALLIDOS,
        bloqueadoHasta: new Date(Date.now() - 60_000), // venció hace un minuto
      },
    });

    const r = await registrarIntentoFallido(
      await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    );

    expect(r.intentosFallidos).toBe(1);
    expect(r.bloqueado).toBe(false);
  });

  it("no toca a quien nunca estuvo bloqueado (bloqueadoHasta NULL)", async () => {
    // Un `bloqueadoHasta` NULL no cumple `lte` por la lógica de tres
    // valores de SQL. Si el updateMany lo alcanzara, cada intento fallido
    // reiniciaría el contador y el lockout no bloquearía jamás.
    const usuario = await crearUsuario("lockout3");
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 3, bloqueadoHasta: null },
    });

    const r = await registrarIntentoFallido(
      await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    );
    expect(r.intentosFallidos).toBe(4);
  });

  // El bug real que arregló el `increment` atómico: leer-calcular-escribir
  // deja que N intentos en paralelo lean todos 0 y escriban todos 1, así
  // que el tope se pasa por mucho mandando los intentos a la vez. Con el
  // increment bajo el lock de fila, los N números son distintos.
  it("cuenta bien N intentos simultáneos, no solo en fila", async () => {
    const usuario = await crearUsuario("lockout4");
    const fresco = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });

    const resultados = await Promise.all(
      Array.from({ length: MAX_INTENTOS_FALLIDOS }, () => registrarIntentoFallido(fresco))
    );

    const contados = resultados.map((r) => r.intentosFallidos).sort((a, b) => a - b);
    expect(contados).toEqual([1, 2, 3, 4, 5]);
    // Exactamente uno cruza el umbral.
    expect(resultados.filter((r) => r.bloqueado)).toHaveLength(1);
  });

  it("un login exitoso limpia el contador y el bloqueo", async () => {
    const usuario = await crearUsuario("lockout5");
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 4, bloqueadoHasta: new Date(Date.now() + 60_000) },
    });

    await registrarLoginExitoso(usuario.id);

    const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(guardado.intentosFallidos).toBe(0);
    expect(guardado.bloqueadoHasta).toBeNull();
    expect(guardado.ultimoLogin).not.toBeNull();
  });
});

describe("freno por IP", () => {
  async function registrarFallos(ip: string, cuantos: number, cuandoMinutosAtras = 0) {
    for (let i = 0; i < cuantos; i++) {
      await prisma.sesionLog.create({
        data: {
          usuarioId: null,
          usernameIntentado: `inexistente${i}`,
          exitoso: false,
          motivoFalla: "usuario_no_existe",
          ipAddress: ip,
          timestamp: new Date(Date.now() - cuandoMinutosAtras * 60_000),
        },
      });
    }
  }

  it("bloquea al llegar al tope y no antes", async () => {
    await registrarFallos(IP, MAX_INTENTOS_POR_IP - 1);
    expect(await ipBloqueada(IP)).toBe(false);

    await registrarFallos(IP, 1);
    expect(await ipBloqueada(IP)).toBe(true);
  });

  // Es lo que distingue este freno del lockout por cuenta: cubre al
  // atacante que prueba usernames que no existen, y esos nunca acumulan
  // `intentos_fallidos` en ninguna fila de usuarios.
  it("cuenta intentos contra usuarios inexistentes", async () => {
    await registrarFallos(IP, MAX_INTENTOS_POR_IP);
    expect(await ipBloqueada(IP)).toBe(true);
    expect(await prisma.usuario.count()).toBe(0);
  });

  it("los intentos exitosos no cuentan", async () => {
    const usuario = await crearUsuario("ipok");
    for (let i = 0; i < MAX_INTENTOS_POR_IP + 5; i++) {
      await prisma.sesionLog.create({
        data: {
          usuarioId: usuario.id,
          usernameIntentado: "ipok",
          exitoso: true,
          ipAddress: IP,
          timestamp: new Date(),
        },
      });
    }
    expect(await ipBloqueada(IP)).toBe(false);
  });

  it("no castiga a una IP distinta", async () => {
    await registrarFallos(IP, MAX_INTENTOS_POR_IP);
    expect(await ipBloqueada("198.51.100.7")).toBe(false);
  });

  it("los intentos viejos salen de la ventana", async () => {
    await registrarFallos(IP, MAX_INTENTOS_POR_IP, MINUTOS_VENTANA_IP + 1);
    expect(await ipBloqueada(IP)).toBe(false);
  });

  // Sin IP (`null`) no se puede atribuir el intento a nadie. Que no bloquee
  // es lo correcto —bloquearía a todo el mundo a la vez— y conviene que
  // esté fijado, porque el default contrario sería un modo de falla global.
  it("una IP nula no bloquea a todos", async () => {
    for (let i = 0; i < MAX_INTENTOS_POR_IP + 5; i++) {
      await prisma.sesionLog.create({
        data: {
          usuarioId: null,
          usernameIntentado: "x",
          exitoso: false,
          ipAddress: null,
          timestamp: new Date(),
        },
      });
    }
    expect(await ipBloqueada(IP)).toBe(false);
  });
});

describe("autenticar, de punta a punta", () => {
  it("con credenciales buenas crea sesión, auditoría y renglón de log", async () => {
    const usuario = await crearUsuario("bueno");

    const r = await autenticar("bueno", PASSWORD, meta);
    expect(r.exitoso).toBe(true);

    expect(await prisma.sesion.count({ where: { usuarioId: usuario.id } })).toBe(1);
    expect(
      await prisma.auditoria.count({ where: { usuarioId: usuario.id, accion: "login" } })
    ).toBe(1);
    expect(await prisma.sesionLog.count({ where: { exitoso: true } })).toBe(1);
  });

  it("una contraseña mala no crea sesión y cuenta el intento", async () => {
    const usuario = await crearUsuario("malo");

    const r = await autenticar("malo", "Incorrecta1!", meta);
    expect(r.exitoso).toBe(false);
    if (!r.exitoso) expect(r.mensaje).toBe("Credenciales incorrectas");
    expect(await prisma.sesion.count()).toBe(0);

    const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(guardado.intentosFallidos).toBe(1);
  });

  it("un usuario inexistente devuelve Credenciales incorrectas sin revelar su ausencia", async () => {
    const r = await autenticar("no_existo", "Cualquiera123!", meta);
    expect(r.exitoso).toBe(false);
    if (!r.exitoso) expect(r.mensaje).toBe("Credenciales incorrectas");
    expect(await prisma.sesion.count()).toBe(0);
  });

  it("un usuario desactivado no entra aunque la contraseña sea correcta", async () => {
    await crearUsuario("inactivo", { activo: false });

    const r = await autenticar("inactivo", PASSWORD, meta);
    expect(r.exitoso).toBe(false);
    if (!r.exitoso) expect(r.mensaje).toBe("Credenciales incorrectas");
    expect(await prisma.sesion.count()).toBe(0);
  });

  it("un usuario bloqueado no entra aunque la contraseña sea correcta", async () => {
    const usuario = await crearUsuario("bloqueado");
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosFallidos: MAX_INTENTOS_FALLIDOS,
        bloqueadoHasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60_000),
      },
    });

    const r = await autenticar("bloqueado", PASSWORD, meta);
    expect(r.exitoso).toBe(false);
    if (!r.exitoso) expect(r.mensaje).toBe("Credenciales incorrectas");
    expect(await prisma.sesion.count()).toBe(0);
  });

  it("una IP frenada no llega ni a comprobar la contraseña", async () => {
    const usuario = await crearUsuario("victima");
    for (let i = 0; i < MAX_INTENTOS_POR_IP; i++) {
      await prisma.sesionLog.create({
        data: {
          usuarioId: null,
          usernameIntentado: "otro",
          exitoso: false,
          ipAddress: IP,
          timestamp: new Date(),
        },
      });
    }

    const r = await autenticar("victima", PASSWORD, meta);
    expect(r.exitoso).toBe(false);
    expect(await prisma.sesion.count()).toBe(0);
    // Y no se le cuenta un intento fallido a la cuenta: el freno es de red,
    // castigar además al dueño lo dejaría bloqueado por culpa de un tercero.
    const guardado = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(guardado.intentosFallidos).toBe(0);
  });

  it("cinco intentos malos seguidos dejan la cuenta bloqueada", async () => {
    await crearUsuario("fuerzabruta");
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i++) {
      await autenticar("fuerzabruta", "Incorrecta1!", meta);
    }

    // Ahora ni la correcta entra.
    const r = await autenticar("fuerzabruta", PASSWORD, meta);
    expect(r.exitoso).toBe(false);
    if (!r.exitoso) expect(r.mensaje).toBe("Credenciales incorrectas");
    expect(await prisma.sesion.count()).toBe(0);
  });

  it("loginAction devuelve Credenciales incorrectas para credenciales fallidas (P8.1)", async () => {
    const fd = new FormData();
    fd.append("username", "usuario_inexistente");
    fd.append("password", "ClaveIncorrecta1!");

    const res = await loginAction({}, fd);
    expect(res.mensaje).toBe("Credenciales incorrectas");
  });
});

describe("leerSesion — los tres criterios que matan una sesión", () => {
  async function sesionDe(usuarioId: number) {
    await crearSesion(usuarioId, { ipAddress: IP, userAgent: "vitest" });
    return prisma.sesion.findFirstOrThrow({ where: { usuarioId } });
  }

  it("una sesión fresca autentica", async () => {
    const usuario = await crearUsuario("vivo");
    await sesionDe(usuario.id);

    const leido = await leerSesion();
    expect(leido?.id).toBe(usuario.id);
  });

  it("sin cookie no hay sesión", async () => {
    await crearUsuario("sincookie");
    expect(await leerSesion()).toBeNull();
  });

  it("rechaza y borra una sesión pasada del tope absoluto", async () => {
    const usuario = await crearUsuario("absoluta");
    const sesion = await sesionDe(usuario.id);
    await prisma.sesion.update({
      where: { id: sesion.id },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });

    expect(await leerSesion()).toBeNull();
    // No basta con rechazarla: se borra, que es lo que impide que la
    // pantalla de sesiones activas se llene de fantasmas.
    expect(await prisma.sesion.count({ where: { id: sesion.id } })).toBe(0);
  });

  it("rechaza una sesión pasada de la ventana de inactividad", async () => {
    const usuario = await crearUsuario("inactiva");
    const sesion = await sesionDe(usuario.id);
    await prisma.sesion.update({
      where: { id: sesion.id },
      data: {
        ultimaActividad: new Date(
          Date.now() - (TIMEOUT_INACTIVIDAD_HORAS * 60 * 60 * 1000 + 60_000)
        ),
      },
    });

    expect(await leerSesion()).toBeNull();
    expect(await prisma.sesion.count({ where: { id: sesion.id } })).toBe(0);
  });

  // Es la razón por la que ADR-15 eligió sesiones opacas en vez de JWT: un
  // JWT no se puede revocar antes de expirar, y desactivar a alguien tiene
  // que cortarle el acceso en el siguiente request, no en 24 h.
  it("rechaza la sesión de un usuario desactivado en vivo", async () => {
    const usuario = await crearUsuario("desactivable");
    const sesion = await sesionDe(usuario.id);
    expect(await leerSesion()).not.toBeNull();

    await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });

    expect(await leerSesion()).toBeNull();
    expect(await prisma.sesion.count({ where: { id: sesion.id } })).toBe(0);
  });

  it("la ventana absoluta que se fija al crear es la de lib/sesion.ts", async () => {
    // Si alguien cambiara la constante en un solo lado, la pantalla de
    // sesiones y la autenticación empezarían a discrepar en silencio.
    const usuario = await crearUsuario("ventana");
    const sesion = await sesionDe(usuario.id);
    const horas = (sesion.expiraEn.getTime() - sesion.creadaEn.getTime()) / 3_600_000;
    expect(Math.round(horas)).toBe(DURACION_ABSOLUTA_HORAS);
  });

  it("destruir la sesión actual la borra y quita la cookie", async () => {
    const usuario = await crearUsuario("saliendo");
    await sesionDe(usuario.id);

    await destruirSesionActual();

    expect(await prisma.sesion.count({ where: { usuarioId: usuario.id } })).toBe(0);
    expect(await leerSesion()).toBeNull();
  });
});

// Cambiar la contrasena debe cerrar las sesiones abiertas previas
// para mitigar accesos no autorizados tras una rotacion de credencial.
describe("invalidación de sesiones al cambiar la contraseña", () => {
  it("un reset de admin cierra TODAS las sesiones del afectado", async () => {
    const admin = await crearUsuario("admin1");
    const victima = await crearUsuario("victima1");

    await prisma.sesion.createMany({
      data: [
        { usuarioId: victima.id, tokenHash: "a".repeat(64), expiraEn: new Date(Date.now() + 3_600_000) },
        { usuarioId: victima.id, tokenHash: "b".repeat(64), expiraEn: new Date(Date.now() + 3_600_000) },
      ],
    });
    // La sesión de otro usuario no se toca.
    await prisma.sesion.create({
      data: { usuarioId: admin.id, tokenHash: "c".repeat(64), expiraEn: new Date(Date.now() + 3_600_000) },
    });

    await resetearPassword({ id: admin.id, rol: "admin" }, victima.id, {
      password: "NuevaClave1!",
      confirmar: "NuevaClave1!",
    });

    expect(await prisma.sesion.count({ where: { usuarioId: victima.id } })).toBe(0);
    expect(await prisma.sesion.count({ where: { usuarioId: admin.id } })).toBe(1);
  });

  it("cambiar la propia contraseña cierra las demás y conserva la en curso", async () => {
    const usuario = await crearUsuario("yomismo");

    // La sesión "en curso" es la de la cookie del frasco.
    await crearSesion(usuario.id, { ipAddress: IP, userAgent: "vitest" });
    const enCurso = await prisma.sesion.findFirstOrThrow({ where: { usuarioId: usuario.id } });

    // Otras dos, de otros dispositivos.
    await prisma.sesion.createMany({
      data: [
        { usuarioId: usuario.id, tokenHash: "d".repeat(64), expiraEn: new Date(Date.now() + 3_600_000) },
        { usuarioId: usuario.id, tokenHash: "e".repeat(64), expiraEn: new Date(Date.now() + 3_600_000) },
      ],
    });

    await cambiarPasswordPropia(usuario.id, PASSWORD, "OtraClave1!");

    const quedan = await prisma.sesion.findMany({ where: { usuarioId: usuario.id } });
    // Expulsar también a quien cambia la contraseña dejaría dentro justo a
    // quien se quería sacar.
    expect(quedan).toHaveLength(1);
    expect(quedan[0].id).toBe(enCurso.id);
  });

  it("cambiar la propia contraseña exige la actual", async () => {
    const usuario = await crearUsuario("verifica");
    await expect(
      cambiarPasswordPropia(usuario.id, "NoEsLaActual1!", "OtraClave1!")
    ).rejects.toThrow();
  });

  it("cuenta intentos fallidos en cambio de contraseña y bloquea tras 5 intentos (P8.3)", async () => {
    const usuario = await crearUsuario("fuerzami");
    for (let i = 1; i < MAX_INTENTOS_FALLIDOS; i++) {
      await expect(
        cambiarPasswordPropia(usuario.id, "Erronea123!", "NuevaClave123!")
      ).rejects.toThrow(/incorrecta/i);

      const u = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
      expect(u.intentosFallidos).toBe(i);
      expect(estaBloqueado(u)).toBe(false);
    }

    // 5to intento erróneo => se bloquea
    await expect(
      cambiarPasswordPropia(usuario.id, "Erronea123!", "NuevaClave123!")
    ).rejects.toThrow(/bloqueado/i);

    const bloqueado = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(bloqueado.intentosFallidos).toBe(MAX_INTENTOS_FALLIDOS);
    expect(estaBloqueado(bloqueado)).toBe(true);

    // Intento posterior con cambiarContrasena estando bloqueado se niega de inmediato
    await expect(
      cambiarContrasena(usuario.id, PASSWORD, "NuevaClave123!")
    ).rejects.toThrow(/bloqueado/i);

    // Y el login también está bloqueado para esta cuenta
    const r = await autenticar("fuerzami", PASSWORD, meta);
    expect(r.exitoso).toBe(false);
    if (!r.exitoso) expect(r.mensaje).toBe("Credenciales incorrectas");
  });

  it("cambiar la contraseña con éxito resetea intentos fallidos acumulados (P8.3)", async () => {
    const usuario = await crearUsuario("resetea_fallos");
    await expect(
      cambiarPasswordPropia(usuario.id, "Erronea123!", "NuevaClave123!")
    ).rejects.toThrow();

    const u1 = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(u1.intentosFallidos).toBe(1);

    await cambiarContrasena(usuario.id, PASSWORD, "NuevaClave123!");

    const u2 = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(u2.intentosFallidos).toBe(0);
    expect(u2.bloqueadoHasta).toBeNull();
  });

  // Este caso lo destapó una mutación mal apuntada: al borrar por error el
  // `deleteMany` de `actualizarUsuario` en vez del de `resetearPassword`,
  // las 27 pruebas siguieron en verde. O sea que desactivar a alguien
  // cerraba sus sesiones y NADA lo comprobaba.
  it("desactivar a un usuario le cierra las sesiones en el acto", async () => {
    const admin = await crearUsuario("admin2");
    const victima = await crearUsuario("victima2");
    await prisma.sesion.create({
      data: {
        usuarioId: victima.id,
        tokenHash: "f".repeat(64),
        expiraEn: new Date(Date.now() + 3_600_000),
      },
    });

    await actualizarUsuario({ id: admin.id, rol: "admin" }, victima.id, {
      nombreCompleto: "Usuario victima2",
      email: undefined,
      rol: "consulta",
      activo: false,
    });

    expect(await prisma.sesion.count({ where: { usuarioId: victima.id } })).toBe(0);
  });

  it("editar sin desactivar no toca las sesiones", async () => {
    const admin = await crearUsuario("admin3");
    const otro = await crearUsuario("otro3");
    await prisma.sesion.create({
      data: {
        usuarioId: otro.id,
        tokenHash: "0".repeat(64),
        expiraEn: new Date(Date.now() + 3_600_000),
      },
    });

    await actualizarUsuario({ id: admin.id, rol: "admin" }, otro.id, {
      nombreCompleto: "Nombre nuevo",
      email: undefined,
      rol: "consulta",
      activo: true,
    });

    expect(await prisma.sesion.count({ where: { usuarioId: otro.id } })).toBe(1);
  });
});
