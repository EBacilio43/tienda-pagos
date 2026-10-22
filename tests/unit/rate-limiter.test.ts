import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RateLimiter,
  claveCompuesta,
  extraerIpDeHeaders,
  extraerIpDeRequest,
  crearRespuesta429,
  rateLimiterLogin,
  rateLimiterFinanciero,
  assertRateLimitLogin,
  assertRateLimitFinanciero,
} from "@/server/auth/rate-limiter";
import { ErrorDominio } from "@/lib/errores";

describe("RateLimiter (Token Bucket)", () => {
  let tiempoSimulado: number;
  let reloj: () => number;

  beforeEach(() => {
    tiempoSimulado = 1_000_000;
    reloj = () => tiempoSimulado;
    rateLimiterLogin.reiniciar();
    rateLimiterFinanciero.reiniciar();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("permite ráfagas de peticiones continuas hasta la capacidad del bucket", () => {
    const limiter = new RateLimiter({
      capacidad: 5,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    for (let i = 0; i < 5; i++) {
      const res = limiter.consumir("ip-test");
      expect(res.permitido).toBe(true);
      expect(res.restantes).toBe(4 - i);
      expect(res.limite).toBe(5);
      expect(res.retryAfterSegundos).toBe(0);
    }
  });

  it("bloquea peticiones inmediatamente al superar la capacidad máxima", () => {
    const limiter = new RateLimiter({
      capacidad: 5,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    for (let i = 0; i < 5; i++) {
      limiter.consumir("ip-test");
    }

    const sextaPeticion = limiter.consumir("ip-test");
    expect(sextaPeticion.permitido).toBe(false);
    expect(sextaPeticion.restantes).toBe(0);
    expect(sextaPeticion.limite).toBe(5);
    expect(sextaPeticion.retryAfterSegundos).toBeGreaterThan(0);
    // Para recargar 1 token (de 5 en 60s) hacen falta 12 segundos
    expect(sextaPeticion.retryAfterSegundos).toBe(12);
  });

  it("recupera tokens gradualmente conforme transcurre el tiempo", () => {
    const limiter = new RateLimiter({
      capacidad: 5,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    // Agotar tokens
    for (let i = 0; i < 5; i++) {
      limiter.consumir("ip-test");
    }
    expect(limiter.consumir("ip-test").permitido).toBe(false);

    // Avanzar 12 segundos -> recarga 1 token
    tiempoSimulado += 12_000;
    const intentoRecuperado = limiter.consumir("ip-test");
    expect(intentoRecuperado.permitido).toBe(true);
    expect(intentoRecuperado.restantes).toBe(0);

    // Siguiente intento inmediato vuelve a ser bloqueado
    expect(limiter.consumir("ip-test").permitido).toBe(false);
  });

  it("recupera la capacidad completa tras transcurrir la ventana de tiempo completa", () => {
    const limiter = new RateLimiter({
      capacidad: 5,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    for (let i = 0; i < 5; i++) {
      limiter.consumir("ip-test");
    }
    expect(limiter.consumir("ip-test").permitido).toBe(false);

    // Avanzar 60 segundos completos
    tiempoSimulado += 60_000;

    // Ahora debe poder hacer 5 intentos de nuevo (ráfaga completa)
    for (let i = 0; i < 5; i++) {
      const res = limiter.consumir("ip-test");
      expect(res.permitido).toBe(true);
    }
    expect(limiter.consumir("ip-test").permitido).toBe(false);
  });

  it("aísla los límites entre diferentes identificadores (IPs independientes)", () => {
    const limiter = new RateLimiter({
      capacidad: 2,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    // Agotar IP A
    expect(limiter.consumir("192.168.1.1").permitido).toBe(true);
    expect(limiter.consumir("192.168.1.1").permitido).toBe(true);
    expect(limiter.consumir("192.168.1.1").permitido).toBe(false);

    // IP B no se ve afectada
    expect(limiter.consumir("192.168.1.2").permitido).toBe(true);
    expect(limiter.consumir("192.168.1.2").permitido).toBe(true);
    expect(limiter.consumir("192.168.1.2").permitido).toBe(false);
  });

  it("soporta claves compuestas para separar límites por IP y endpoint", () => {
    const limiter = new RateLimiter({
      capacidad: 1,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    const claveLogin = claveCompuesta("192.168.1.1", "/login");
    const claveVentas = claveCompuesta("192.168.1.1", "/ventas");

    expect(limiter.consumir(claveLogin).permitido).toBe(true);
    expect(limiter.consumir(claveLogin).permitido).toBe(false);

    // El endpoint de ventas sigue disponible para la misma IP
    expect(limiter.consumir(claveVentas).permitido).toBe(true);
    expect(limiter.consumir(claveVentas).permitido).toBe(false);
  });

  it("assert() lanza ErrorDominio con mensaje exacto cuando se excede el límite", () => {
    const limiter = new RateLimiter({
      capacidad: 1,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    limiter.assert("user-1");
    expect(() => limiter.assert("user-1")).toThrowError(ErrorDominio);
    expect(() => limiter.assert("user-1")).toThrowError(
      "Demasiadas peticiones. Intenta de nuevo en un momento."
    );
  });

  it("podar() limpia entradas completamente recargadas e inactivas", () => {
    const limiter = new RateLimiter({
      capacidad: 5,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    limiter.consumir("activa");
    limiter.consumir("inactiva");
    expect(limiter.tamano()).toBe(2);

    // Avanzar 30s: nada debe podarse todavía
    tiempoSimulado += 30_000;
    expect(limiter.podar()).toBe(0);
    expect(limiter.tamano()).toBe(2);

    // "activa" tiene una petición
    limiter.consumir("activa");

    // Avanzar 35s más (total 65s para "inactiva", 35s para "activa")
    tiempoSimulado += 35_000;
    const podadas = limiter.podar();
    expect(podadas).toBe(1);
    expect(limiter.tamano()).toBe(1);

    // "activa" aún está en memoria
    tiempoSimulado += 30_000;
    expect(limiter.podar()).toBe(1);
    expect(limiter.tamano()).toBe(0);
  });

  it("desaloja automáticamente las llaves más antiguas cuando se supera maxLlaves", () => {
    const limiter = new RateLimiter({
      capacidad: 5,
      ventanaMs: 60_000,
      maxLlaves: 5,
      intervaloLimpiezaMs: 0,
      reloj,
    });

    // Insertar 5 llaves espaciadas en el tiempo
    for (let i = 1; i <= 5; i++) {
      tiempoSimulado += 100;
      limiter.consumir(`ip-${i}`);
    }
    expect(limiter.tamano()).toBe(5);

    // Insertar una 6ta llave; al sobrepasar maxLlaves desaloja entradas antiguas (LRU)
    tiempoSimulado += 100;
    limiter.consumir("ip-6");

    // El tamaño se mantiene acotado
    expect(limiter.tamano()).toBeLessThanOrEqual(5);
  });

  it("destruir() limpia intervalos y vacía la memoria", () => {
    const limiter = new RateLimiter({
      capacidad: 5,
      ventanaMs: 60_000,
      intervaloLimpiezaMs: 10_000,
      reloj,
    });

    limiter.consumir("ip-test");
    expect(limiter.tamano()).toBe(1);

    limiter.destruir();
    expect(limiter.tamano()).toBe(0);
  });

  it("valida que la capacidad no sea menor o igual a cero", () => {
    expect(
      () =>
        new RateLimiter({
          capacidad: 0,
        })
    ).toThrowError("La capacidad debe ser mayor a 0");
  });
});

describe("Utilidades y configuraciones predeterminadas", () => {
  it("extraerIpDeHeaders() detecta IP en x-forwarded-for y x-real-ip con fallback a 127.0.0.1", () => {
    const headersConForwarded = new Headers({
      "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
    });
    expect(extraerIpDeHeaders(headersConForwarded)).toBe("203.0.113.195");

    const headersConRealIp = new Headers({
      "x-real-ip": "198.51.100.1",
    });
    expect(extraerIpDeHeaders(headersConRealIp)).toBe("198.51.100.1");

    const headersVacio = new Headers();
    expect(extraerIpDeHeaders(headersVacio)).toBe("127.0.0.1");
  });

  it("extraerIpDeRequest() da prioridad a request.ip si existe", () => {
    const req = {
      ip: "10.0.0.5",
      headers: new Headers({ "x-forwarded-for": "203.0.113.1" }),
    };
    expect(extraerIpDeRequest(req)).toBe("10.0.0.5");
  });

  it("crearRespuesta429() construye un NextResponse HTTP 429 con cabecera Retry-After", async () => {
    const resp = crearRespuesta429(45);
    expect(resp.status).toBe(429);
    expect(resp.headers.get("Retry-After")).toBe("45");
    expect(resp.headers.get("Content-Type")).toContain("text/plain");

    const texto = await resp.text();
    expect(texto).toBe("Demasiadas peticiones. Intenta de nuevo en un momento.");
  });

  it("rateLimiterLogin está configurado para 5 peticiones y assertRateLimitLogin lanza error al excederlo", () => {
    rateLimiterLogin.reiniciar();
    const ip = "1.2.3.4";

    for (let i = 0; i < 5; i++) {
      expect(() => assertRateLimitLogin(ip)).not.toThrow();
    }

    expect(() => assertRateLimitLogin(ip)).toThrowError(
      "Demasiadas peticiones. Intenta de nuevo en un momento."
    );
  });

  it("rateLimiterFinanciero está configurado para 60 peticiones y assertRateLimitFinanciero lanza error al excederlo", () => {
    rateLimiterFinanciero.reiniciar();
    const usuarioId = 42;

    for (let i = 0; i < 60; i++) {
      expect(() => assertRateLimitFinanciero(usuarioId)).not.toThrow();
    }

    expect(() => assertRateLimitFinanciero(usuarioId)).toThrowError(
      "Demasiadas peticiones. Intenta de nuevo en un momento."
    );
  });

  it("assertRateLimitFinanciero combina IP y usuario cuando se proporciona IP", () => {
    rateLimiterFinanciero.reiniciar();
    const usuarioId = 10;
    const ip = "192.168.1.50";

    for (let i = 0; i < 60; i++) {
      expect(() => assertRateLimitFinanciero(usuarioId, ip)).not.toThrow();
    }

    // Se excede para ese par usuario e IP
    expect(() => assertRateLimitFinanciero(usuarioId, ip)).toThrowError(
      "Demasiadas peticiones. Intenta de nuevo en un momento."
    );

    // Mismo usuario con otra IP tiene su propio cupo
    expect(() => assertRateLimitFinanciero(usuarioId, "192.168.1.51")).not.toThrow();
  });
});
