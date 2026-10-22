import { prisma } from "@/server/db/prisma";

// Fase 7: el lockout de lockout.ts es por CUENTA — no protege contra un
// atacante que prueba muchos usernames distintos (o usernames que no
// existen, que nunca acumulan intentos_fallidos) desde la misma IP.
// Reusa sesiones_log (ya guarda ip_address y exitoso en cada intento,
// Fase 1) en vez de mantener estado en memoria — sobrevive un restart
// del server y no requiere infraestructura nueva.
export const MAX_INTENTOS_POR_IP = 20;
export const MINUTOS_VENTANA_IP = 15;

export async function ipBloqueada(ip: string | null): Promise<boolean> {
  const desde = new Date(Date.now() - MINUTOS_VENTANA_IP * 60_000);
  const intentos = await prisma.sesionLog.count({
    where: {
      ipAddress: ip,
      exitoso: false,
      OR: [{ motivoFalla: null }, { motivoFalla: { not: "sesion_reemplazada" } }],
      timestamp: { gte: desde },
    },
  });
  return intentos >= MAX_INTENTOS_POR_IP;
}
