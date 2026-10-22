import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { leerSesion, destruirSesionActual } from "@/server/auth/session";
import { ipDelCliente } from "@/server/auth/ip-cliente";
import { prisma } from "@/server/db/prisma";

// POST, no GET: el legacy exponía /logout por GET (main.py:11), sin CSRF.
// Next valida el Origin nativamente en esta ruta. Redirige (no JSON) para
// que funcione como un <form method="post"> plano, sin JS de cliente.
export async function POST() {
  const usuario = await leerSesion();

  if (usuario) {
    const ipAddress = ipDelCliente(await headers());
    await prisma.auditoria.create({
      data: {
        usuarioId: usuario.id,
        accion: "logout",
        tablaAfectada: "usuarios",
        registroId: String(usuario.id),
        ipAddress,
        timestamp: new Date(),
      },
    });
  }

  await destruirSesionActual();

  // Location RELATIVO, no `NextResponse.redirect(new URL(..., request.url))`.
  //
  // `NextResponse.redirect` exige una URL absoluta, y la única base a mano
  // es `request.url` — que el servidor de Next arma con la dirección a la
  // que está ENLAZADO, no con el host público. En Railway eso es
  // `HOSTNAME=0.0.0.0` y `PORT=8080` (docker/Dockerfile), así que la
  // cabecera salía como `Location: https://0.0.0.0:8080/login`: una
  // dirección a la que ningún navegador puede ir. El efecto exacto era el
  // peor posible — la sesión SÍ se destruía y la cookie SÍ se borraba, pero
  // la navegación moría, así que "Salir" se veía como un botón que no hace
  // nada mientras dejaba al usuario deslogueado y varado. Comprobado contra
  // producción el 2026-09-01; en local nunca se vio porque ahí `request.url`
  // es `http://localhost:3000`, que sí es alcanzable.
  //
  // Un Location relativo es válido (RFC 7231 §7.1.2) y lo resuelve el
  // navegador contra la URL pública, sea cual sea el proxy que haya delante.
  // El middleware ya emitía uno relativo, por eso ese camino nunca falló.
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
