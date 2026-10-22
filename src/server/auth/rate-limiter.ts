import { NextResponse } from "next/server";
import { ErrorDominio } from "@/lib/errores";

export interface OpcionesRateLimiter {
  /** Capacidad máxima del bucket (ráfaga permitida). */
  capacidad: number;
  /** Ventana de recarga completa en milisegundos. Por defecto 60_000 (1 minuto). */
  ventanaMs?: number;
  /** Límite superior de llaves en memoria para evitar agotamiento por DoS. Por defecto 10_000. */
  maxLlaves?: number;
  /** Intervalo del recolector de llaves expiradas en milisegundos. 0 deshabilita timer. */
  intervaloLimpiezaMs?: number;
  /** Reloj inyectable para pruebas unitarias deterministas. Por defecto Date.now. */
  reloj?: () => number;
}

export interface ResultadoRateLimit {
  permitido: boolean;
  restantes: number;
  limite: number;
  resetMs: number;
  retryAfterSegundos: number;
}

interface EntradaBucket {
  tokens: number;
  ultimoRefill: number;
  ultimoAcceso: number;
}

/**
 * Limitador de frecuencia en memoria basado en Token Bucket.
 * Soporta ráfagas controladas, recarga constante en el tiempo y
 * poda automática de entradas inactivas para evitar fugas de memoria.
 */
export class RateLimiter {
  private readonly capacidad: number;
  private readonly ventanaMs: number;
  private readonly maxLlaves: number;
  private readonly reloj: () => number;
  private readonly entradas: Map<string, EntradaBucket> = new Map();
  private timerLimpieza?: ReturnType<typeof setInterval>;

  constructor(opciones: OpcionesRateLimiter) {
    if (opciones.capacidad <= 0) {
      throw new Error("La capacidad debe ser mayor a 0");
    }
    this.capacidad = opciones.capacidad;
    this.ventanaMs = opciones.ventanaMs ?? 60_000;
    this.maxLlaves = opciones.maxLlaves ?? 10_000;
    this.reloj = opciones.reloj ?? (() => Date.now());

    const intervalo = opciones.intervaloLimpiezaMs ?? 60_000;
    if (intervalo > 0 && typeof setInterval !== "undefined") {
      this.timerLimpieza = setInterval(() => {
        this.podar();
      }, intervalo);
      if (
        this.timerLimpieza &&
        typeof this.timerLimpieza === "object" &&
        "unref" in this.timerLimpieza
      ) {
        this.timerLimpieza.unref();
      }
    }
  }

  /**
   * Intenta consumir un número determinado de tokens (por defecto 1).
   */
  public consumir(clave: string, costo: number = 1): ResultadoRateLimit {
    const ahora = this.reloj();
    const tasaRefill = this.capacidad / this.ventanaMs;
    let entrada = this.entradas.get(clave);

    if (entrada) {
      const tiempoTranscurrido = Math.max(0, ahora - entrada.ultimoRefill);
      const tokensRecargados = tiempoTranscurrido * tasaRefill;
      entrada.tokens = Math.min(this.capacidad, entrada.tokens + tokensRecargados);
      entrada.ultimoRefill = ahora;
      entrada.ultimoAcceso = ahora;
    } else {
      if (this.entradas.size >= this.maxLlaves) {
        this.podar(ahora);
        if (this.entradas.size >= this.maxLlaves) {
          this.desalojarAntiguos();
        }
      }
      entrada = {
        tokens: this.capacidad,
        ultimoRefill: ahora,
        ultimoAcceso: ahora,
      };
      this.entradas.set(clave, entrada);
    }

    if (entrada.tokens >= costo) {
      entrada.tokens -= costo;
      const restantes = Math.floor(entrada.tokens);
      const faltanParaLleno = this.capacidad - entrada.tokens;
      const resetMs = Math.ceil(faltanParaLleno / tasaRefill);
      return {
        permitido: true,
        restantes,
        limite: this.capacidad,
        resetMs,
        retryAfterSegundos: 0,
      };
    }

    const faltantes = costo - entrada.tokens;
    const resetMs = Math.ceil(faltantes / tasaRefill);
    const retryAfterSegundos = Math.max(1, Math.ceil(resetMs / 1000));
    return {
      permitido: false,
      restantes: 0,
      limite: this.capacidad,
      resetMs,
      retryAfterSegundos,
    };
  }

  /**
   * Valida el consumo de tokens y lanza ErrorDominio si se sobrepasa el límite.
   */
  public assert(clave: string, costo: number = 1): void {
    const resultado = this.consumir(clave, costo);
    if (!resultado.permitido) {
      throw new ErrorDominio("Demasiadas peticiones. Intenta de nuevo en un momento.");
    }
  }

  /**
   * Elimina de memoria las entradas que ya se recargaron al 100% y no han tenido
   * actividad reciente dentro de la ventana de tiempo.
   */
  public podar(ahora: number = this.reloj()): number {
    let podadas = 0;
    for (const [clave, entrada] of this.entradas.entries()) {
      if (ahora - entrada.ultimoAcceso >= this.ventanaMs) {
        this.entradas.delete(clave);
        podadas++;
      }
    }
    return podadas;
  }

  /**
   * Desaloja el 10% de las entradas menos recientemente accedidas para asegurar
   * un límite estricto de memoria ante ataques con IPs aleatorias infinitas.
   */
  private desalojarAntiguos(): void {
    const aDesalojar = Math.max(1, Math.floor(this.maxLlaves * 0.1));
    const ordenadas = [...this.entradas.entries()].sort(
      (a, b) => a[1].ultimoAcceso - b[1].ultimoAcceso
    );
    for (let i = 0; i < aDesalojar && i < ordenadas.length; i++) {
      this.entradas.delete(ordenadas[i][0]);
    }
  }

  /**
   * Devuelve la cantidad de llaves actualmente en memoria.
   */
  public tamano(): number {
    return this.entradas.size;
  }

  /**
   * Reinicia el estado interno del limitador (útil en pruebas).
   */
  public reiniciar(): void {
    this.entradas.clear();
  }

  /**
   * Limpia intervalos de limpieza y libera memoria.
   */
  public destruir(): void {
    if (this.timerLimpieza) {
      clearInterval(this.timerLimpieza);
      this.timerLimpieza = undefined;
    }
    this.entradas.clear();
  }
}

/**
 * Construye una clave compuesta tipo `ip + endpoint` o `ip + usuario`.
 */
export function claveCompuesta(identificador: string, sufijo: string): string {
  return `${identificador.trim()}:${sufijo.trim()}`;
}

/**
 * Extrae la IP de origen a partir de las cabeceras HTTP (`x-forwarded-for` o `x-real-ip`).
 */
export function extraerIpDeHeaders(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    const primeraIp = forwarded.split(",")[0]?.trim();
    if (primeraIp) return primeraIp;
  }
  const realIp = headersList.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Extrae la IP de origen a partir de un objeto tipo Request con cabeceras o IP directa.
 */
export function extraerIpDeRequest(request: { headers: Headers; ip?: string }): string {
  if (request.ip && request.ip.trim()) {
    return request.ip.trim();
  }
  return extraerIpDeHeaders(request.headers);
}

/**
 * Genera una respuesta estándar HTTP 429 Too Many Requests con cabecera Retry-After.
 */
export function crearRespuesta429(retryAfterSegundos = 60): NextResponse {
  return new NextResponse("Demasiadas peticiones. Intenta de nuevo en un momento.", {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterSegundos))),
    },
  });
}

// Límite de 5 intentos por minuto por IP para login
export const rateLimiterLogin = new RateLimiter({
  capacidad: 5,
  ventanaMs: 60_000,
});

// Límite de 60 peticiones por minuto por IP/usuario para mutaciones financieras críticas
export const rateLimiterFinanciero = new RateLimiter({
  capacidad: 60,
  ventanaMs: 60_000,
});

/**
 * Valida la tasa de login (5 intentos / minuto por IP).
 * Lanza ErrorDominio si se supera el umbral.
 */
export function assertRateLimitLogin(ip: string): void {
  rateLimiterLogin.assert(ip);
}

/**
 * Valida la tasa de mutaciones financieras (60 peticiones / minuto por usuario o IP).
 * Lanza ErrorDominio si se supera el umbral.
 */
export function assertRateLimitFinanciero(usuarioId: number, ip?: string | null): void {
  const clave = ip ? claveCompuesta(ip, `usr:${usuarioId}`) : `usr:${usuarioId}`;
  rateLimiterFinanciero.assert(clave);
}
