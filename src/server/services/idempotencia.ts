import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { ErrorDominio } from "@/lib/errores";

export const TTL_TOKEN_HORAS = 24;

/**
 * Registra y valida un token de idempotencia dentro de una transacción Prisma.
 *
 * Si el token ya existe y no ha expirado, o si una petición concurrente (< 1 ms)
 * intenta registrar el mismo token simultáneamente, se rechaza la transacción
 * con ErrorDominio("Esta operación ya fue procesada.") antes de producir escrituras
 * secundarias o mutaciones de saldo/stock.
 */
export async function registrarIdempotenciaTx(
  tx: Prisma.TransactionClient,
  token: string | undefined | null,
  accion: string
): Promise<void> {
  if (!token) return;

  const tokenLimpio = token.trim();
  if (!tokenLimpio) return;

  const ahora = new Date();

  // 1. Verificación previa por si la transacción previa ya concluyó y está persistida
  const existente = await tx.idempotenciaToken.findUnique({
    where: { token: tokenLimpio },
  });

  if (existente) {
    if (existente.expiraEn > ahora) {
      throw new ErrorDominio("Esta operación ya fue procesada.");
    }
    // Token expirado: se actualiza con nueva ventana
    const expiraEn = new Date(ahora.getTime() + TTL_TOKEN_HORAS * 60 * 60 * 1000);
    await tx.idempotenciaToken.update({
      where: { token: tokenLimpio },
      data: {
        accion,
        expiraEn,
        creadoEn: ahora,
      },
    });
    return;
  }

  // 2. Inserción con candado de unicidad de clave primaria en PostgreSQL.
  // En caso de peticiones concurrentes a < 1 ms, la segunda esperará al commit de la primera
  // y fallará con código P2002 (violación de primary key).
  try {
    const expiraEn = new Date(ahora.getTime() + TTL_TOKEN_HORAS * 60 * 60 * 1000);
    await tx.idempotenciaToken.create({
      data: {
        token: tokenLimpio,
        accion,
        expiraEn,
        creadoEn: ahora,
      },
    });
  } catch (err: unknown) {
    if (esErrorUnicidadIdempotencia(err)) {
      throw new ErrorDominio("Esta operación ya fue procesada.");
    }
    throw err;
  }
}

function esErrorUnicidadIdempotencia(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return true;
  }
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === "P2002" || code === "23505") return true;
  }
  return false;
}

/**
 * Poda de tokens expirados para mantenimiento / podar-logs.ts
 */
export async function podarTokensExpirados(): Promise<number> {
  const resultado = await prisma.idempotenciaToken.deleteMany({
    where: { expiraEn: { lt: new Date() } },
  });
  return resultado.count;
}
