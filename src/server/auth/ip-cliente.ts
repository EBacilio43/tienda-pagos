// Sin `server-only`, igual que sus hermanas `password.ts` y
// `rate-limit-ip.ts`: es una función pura sobre `Headers`, sin secretos ni
// BD, y así puede probarse desde `tests/unit`. Que un Client Component no
// la importe ya lo impone la regla ESLint sobre `@/server/auth/*`.
import { isIP } from "node:net";

// `X-Forwarded-For` lo puede escribir CUALQUIERA. Un proxy no lo reemplaza:
// le AÑADE, por la derecha, la dirección de la que recibió la conexión. Así
// que si un cliente manda `X-Forwarded-For: 9.9.9.9`, la app detrás del edge
// de Railway ve `9.9.9.9, <ip real>` — y leer el primer elemento (que es lo
// que hacíamos) devuelve exactamente el valor que eligió el atacante.
//
// Eso rompía tres cosas a la vez:
//
//   1. `rate-limit-ip.ts` cuenta intentos fallidos POR IP. Con la IP
//      falsificable, rotar un valor nuevo en cada request deja el contador
//      siempre en cero: el freno anti-fuerza-bruta que no depende de que la
//      cuenta exista (el otro, `lockout.ts`, es por cuenta y nunca cuenta
//      los usernames inexistentes) simplemente no existía.
//   2. Al revés: mandar 20 intentos fallidos declarando la IP de la tienda
//      bloquea esa red durante 15 minutos sin haber estado nunca en ella.
//   3. `sesiones.ip_address` y `auditoria.ip_address` guardaban un dato
//      elegido por quien lo escribió. La pantalla de sesiones activas —
//      justo donde un admin va a mirar "¿quién está dentro y desde dónde?" —
//      mostraba la respuesta que el atacante quisiera.
//
// La regla correcta es leer la cadena DE DERECHA A IZQUIERDA y quedarse con
// la primera dirección pública: todo lo que está a la izquierda de la que
// añadió nuestro proxy es texto sin autenticar. Se hace por "primera
// pública" y no por "la última" ni por "contar saltos" a propósito: no
// sabemos cuántos proxies internos mete Railway delante de la app, y esta
// forma da el mismo resultado con uno, con tres, o si el edge reemplaza el
// header en vez de añadirle. Los saltos internos son direcciones privadas
// (10/8, fd00::/8, ...) y se saltan solos.
const MAX_ENTRADAS = 50;

/** Rangos que nunca son un cliente real de internet: sirven para saltarse los saltos internos del proxy. */
function esPrivada(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || // 10.0.0.0/8
      a === 127 || // loopback
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 169 && b === 254) || // link-local
      (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64.0.0/10
    );
  }

  if (version === 6) {
    const bajo = ip.toLowerCase();
    return (
      bajo === "::1" ||
      bajo === "::" ||
      bajo.startsWith("fc") || // ULA fc00::/7
      bajo.startsWith("fd") ||
      bajo.startsWith("fe8") || // link-local fe80::/10
      bajo.startsWith("fe9") ||
      bajo.startsWith("fea") ||
      bajo.startsWith("feb")
    );
  }

  return false;
}

/**
 * Normaliza una entrada suelta de la cadena: quita el puerto y los corchetes
 * que algunos proxies añaden (`1.2.3.4:5678`, `[2001:db8::1]:8080`) y
 * desenvuelve la forma IPv4 mapeada en IPv6 (`::ffff:1.2.3.4`).
 *
 * Devuelve `null` si lo que queda no es una IP. Eso NO es solo higiene: la
 * columna `ip_address` es `VARCHAR(45)`, así que un `X-Forwarded-For` de
 * 5000 caracteres reventaba el INSERT del log de sesión — validar que sea
 * una IP de verdad acota la longitud de paso.
 */
function normalizar(entrada: string): string | null {
  let valor = entrada.trim();
  if (!valor) return null;

  const conCorchetes = valor.match(/^\[(.+)\](?::\d+)?$/);
  if (conCorchetes) {
    valor = conCorchetes[1];
  } else if (valor.split(":").length === 2) {
    // Exactamente un ":" solo puede ser IPv4 con puerto — un IPv6 tiene más.
    valor = valor.split(":")[0];
  }

  const mapeada = valor.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeada) valor = mapeada[1];

  return isIP(valor) ? valor : null;
}

/**
 * La IP del cliente según la cadena de proxies, o `null` si no se puede
 * saber (conexión directa sin `X-Forwarded-For`, como en desarrollo local).
 *
 * `null` es un valor legítimo y los llamadores lo guardan tal cual — pero
 * ojo: `ipBloqueada(null)` mete todos los intentos sin IP conocida en el
 * mismo cubo. En producción (detrás de Railway) el header siempre está.
 */
export function ipDelCliente(headers: Headers): string | null {
  const crudo = headers.get("x-forwarded-for");
  if (!crudo) return null;

  const entradas = crudo.split(",").slice(-MAX_ENTRADAS);

  let ultimaValida: string | null = null;
  for (let i = entradas.length - 1; i >= 0; i--) {
    const ip = normalizar(entradas[i]);
    if (!ip) continue;
    if (ultimaValida === null) ultimaValida = ip;
    if (!esPrivada(ip)) return ip;
  }

  // Todas privadas: es el caso de un despliegue sin edge público (docker
  // local, red interna). La de más a la derecha sigue siendo la única que
  // escribió nuestro propio proxy, así que es la menos mala.
  return ultimaValida;
}
