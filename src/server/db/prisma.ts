// Sin `import "server-only"` a propósito: scripts/ (verificar-saldos.ts,
// etc.) reusa server/services/* fuera del bundler de Next, y ese paquete
// revienta en cualquier Node plano, no solo en un bundle de cliente. La
// barrera real contra que esto llegue al cliente es la regla ESLint
// no-restricted-imports (eslint.config.mjs) sobre src/components/**.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Los defaults de Prisma para transacciones interactivas (timeout 5000 ms,
// maxWait 2000 ms) están calibrados para una base local, y aquí eso engaña:
// ventas.ts, devoluciones.ts y catalogo.ts hacen un bucle de escrituras
// DENTRO de la transacción (ajustarStockTx cuesta 4 viajes por artículo;
// guardarCatalogoEnLote, 3 por artículo). Con Docker, cada viaje es <1 ms y
// el bucle nunca se acerca al corte; contra una base remota con ~30 ms por viaje,
// una venta de 40 artículos son ~164 viajes ≈ 4.9 s y el catálogo en lote
// de 50 artículos ≈ 4.6 s — ambos al filo. Pasarse no da un error de
// negocio: da un P2028 ("Transaction already closed") que mensajeDeError
// traduce a "ocurrió un error inesperado", con rollback de todo el trabajo.
//
// El margen es contra latencia, no contra trabajo lento: ninguna de estas
// transacciones hace nada pesado en la base, solo muchos viajes cortos.
// maxWait sube en la misma proporción — es el tiempo esperando conexión del
// pool, que bajo concurrencia con un pooler remoto también es más lento.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    transactionOptions: { timeout: 20_000, maxWait: 10_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
