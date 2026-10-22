import type { NextConfig } from "next";

// Fase 7 — headers de seguridad estáticos (no dependen del request, a
// diferencia de la Content-Security-Policy con nonce, que vive en
// middleware.ts porque necesita un valor nuevo en cada request).
const HEADERS_SEGURIDAD = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // No hace daño en http:// local — los navegadores la ignoran ahí. En
  // producción (Railway, detrás de TLS) sí endurece contra downgrade.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [
      { source: "/:path*", headers: HEADERS_SEGURIDAD },
      // La previsualización del estado de cuenta monta el PDF real en un
      // <iframe> del MISMO origen (components/previsualizar-estado-cuenta.tsx).
      // `X-Frame-Options: DENY` no distingue origen: prohíbe el framing
      // también desde uno mismo, así que el navegador rechazaba el PDF con
      // ERR_BLOCKED_BY_RESPONSE y el diálogo quedaba en blanco. Con visor de
      // PDF se ve como "rechazó la conexión", que despista hacia la red.
      //
      // Se revisó al construir la vista previa que la CSP no estorbaba
      // —`default-src 'self'` cubre frame-src y `object-src 'none'` solo
      // afecta <object>/<embed>—, pero esa revisión no llegó a este header,
      // que vive en otro archivo (Fase 7) y no en el middleware.
      //
      // SAMEORIGIN y no quitarlo: el framing cruzado sigue prohibido. La
      // ruta es GET, exige sesión y devuelve un documento sin controles que
      // cambien nada, así que enmarcarla desde la propia app no habilita
      // clickjacking de ninguna acción.
      {
        source: "/api/reportes/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/captura-abonos",
        destination: "/pagos/lote",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
