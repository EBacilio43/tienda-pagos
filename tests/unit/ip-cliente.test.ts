import { describe, it, expect } from "vitest";
import { ipDelCliente } from "@/server/auth/ip-cliente";

// `X-Forwarded-For` es entrada hostil: el cliente escribe la parte izquierda
// y el proxy añade la derecha. Estos casos son el contrato del que dependen
// los dos frenos de `autenticar.ts` — si esta función devuelve un valor que
// el atacante controla, `rate-limit-ip.ts` deja de existir sin que falle
// nada visible.
function xff(valor: string | null): Headers {
  return new Headers(valor === null ? {} : { "x-forwarded-for": valor });
}

describe("ipDelCliente", () => {
  it("sin header no inventa una IP", () => {
    expect(ipDelCliente(xff(null))).toBeNull();
    expect(ipDelCliente(xff(""))).toBeNull();
  });

  it("con un solo salto devuelve la IP que puso el proxy", () => {
    expect(ipDelCliente(xff("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("IGNORA lo que el cliente antepuso y toma lo que añadió el proxy", () => {
    // El caso que motivó el archivo: antes se leía el primer elemento.
    expect(ipDelCliente(xff("9.9.9.9, 203.0.113.7"))).toBe("203.0.113.7");
    expect(ipDelCliente(xff("1.1.1.1, 2.2.2.2, 203.0.113.7"))).toBe("203.0.113.7");
  });

  it("se salta los saltos internos privados del proxy, haya los que haya", () => {
    expect(ipDelCliente(xff("9.9.9.9, 203.0.113.7, 10.1.2.3"))).toBe("203.0.113.7");
    expect(ipDelCliente(xff("203.0.113.7, 172.16.0.9, 192.168.1.1"))).toBe("203.0.113.7");
    expect(ipDelCliente(xff("203.0.113.7, 100.64.0.1"))).toBe("203.0.113.7");
    expect(ipDelCliente(xff("203.0.113.7, fd00::1"))).toBe("203.0.113.7");
  });

  it("no deja que declararse privado esconda al cliente real", () => {
    // Poner una privada a la derecha no sirve: se sigue buscando hacia la
    // izquierda, pero solo hasta la primera pública, que es la del proxy.
    expect(ipDelCliente(xff("8.8.8.8, 203.0.113.7, 127.0.0.1"))).toBe("203.0.113.7");
  });

  it("todo privado (docker local, red interna): devuelve la de más a la derecha", () => {
    expect(ipDelCliente(xff("10.0.0.1, 172.18.0.5"))).toBe("172.18.0.5");
    expect(ipDelCliente(xff("::1"))).toBe("::1");
  });

  it("descarta basura y sigue buscando en vez de guardarla", () => {
    // La columna es VARCHAR(45): un valor no-IP aquí reventaba el INSERT.
    expect(ipDelCliente(xff("no-una-ip, 203.0.113.7"))).toBe("203.0.113.7");
    expect(ipDelCliente(xff("203.0.113.7, <script>alert(1)</script>"))).toBe("203.0.113.7");
    expect(ipDelCliente(xff("basura, mas-basura"))).toBeNull();
    expect(ipDelCliente(xff("x".repeat(5000)))).toBeNull();
  });

  it("normaliza puerto, corchetes e IPv4 mapeada en IPv6", () => {
    expect(ipDelCliente(xff("203.0.113.7:41234"))).toBe("203.0.113.7");
    expect(ipDelCliente(xff("[2001:db8::1]:8080"))).toBe("2001:db8::1");
    expect(ipDelCliente(xff("::ffff:203.0.113.7"))).toBe("203.0.113.7");
  });

  it("acepta IPv6 pública tal cual", () => {
    expect(ipDelCliente(xff("2001:db8::1"))).toBe("2001:db8::1");
    expect(ipDelCliente(xff("9.9.9.9, 2001:db8::1"))).toBe("2001:db8::1");
  });

  it("una cadena enorme no cambia el resultado ni cuesta recorrerla entera", () => {
    // Tope de MAX_ENTRADAS: se leen las últimas, que son las que escribió
    // la infraestructura; el relleno de la izquierda es del atacante.
    const relleno = Array.from({ length: 5000 }, () => "9.9.9.9").join(", ");
    expect(ipDelCliente(xff(`${relleno}, 203.0.113.7`))).toBe("203.0.113.7");
  });
});
