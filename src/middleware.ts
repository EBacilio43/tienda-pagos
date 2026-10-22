import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  rateLimiterLogin,
  extraerIpDeRequest,
  crearRespuesta429,
} from "@/server/auth/rate-limiter";

const COOKIE_NAME = "sesion";
const RUTAS_PUBLICAS = ["/login"];

// Fase 7: CSP con nonce por request — va en middleware, no en
// next.config.ts, porque el nonce tiene que ser distinto cada vez (un
// valor fijo en next.config.ts sería un secreto público reusable, igual
// de inútil que no tener CSP). Next.js detecta el nonce en este header y
// se lo aplica solo a los <script> que él mismo genera para la
// hidratación — no hace falta pasarlo a mano por ningún componente. En
// dev hace falta 'unsafe-eval' para Fast Refresh; en producción no.
function construirCSP(nonce: string): string {
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");
}

// AGENTS.md regla 7: esto NO autoriza, solo redirige por UX si falta la
// cookie — CVE-2025-29927 demostró que se salta con un header. Quien
// autoriza de verdad: los layouts (requireUser/requireRole) y, en serio,
// cada servicio, porque cada Server Action es un endpoint HTTP público.
//
// Importante: NO redirige /login → / solo porque hay cookie. Una cookie
// presente no prueba una sesión válida (pudo expirar, o el usuario se
// desactivó) — asumir eso aquí causa un loop de redirects contra el
// layout autenticado, que sí valida contra la BD. Esa redirección
// "ya estás logueado" vive en /login/page.tsx (leerSesion real).
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = construirCSP(nonce);

  // El nonce va también en los headers del REQUEST (no solo la
  // respuesta) — así el propio renderizado de Next lo puede leer para
  // aplicárselo a los <script> de hidratación que genera él mismo.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  function conCSP(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // P13: Freno perimetral contra fuerza bruta / DDoS (Regla 7).
  // 5 intentos por minuto por IP en login.
  if (pathname === "/login" && request.method === "POST") {
    const ip = extraerIpDeRequest(request);
    const resultado = rateLimiterLogin.consumir(ip);
    if (!resultado.permitido) {
      return conCSP(crearRespuesta429(resultado.retryAfterSegundos));
    }
    requestHeaders.set("x-ratelimit-login-checked", "1");
  }

  if (RUTAS_PUBLICAS.includes(pathname)) {
    return conCSP(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (!request.cookies.has(COOKIE_NAME)) {
    return conCSP(NextResponse.redirect(new URL("/login", request.url)));
  }

  return conCSP(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
