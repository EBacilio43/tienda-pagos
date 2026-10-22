# src/server/db — cliente de Prisma

Un archivo, `prisma.ts`: instancia única de `PrismaClient`, cacheada en
`globalThis` fuera de producción para que el hot reload de `next dev` no
abra una conexión nueva en cada guardado (el patrón estándar recomendado
por Prisma con Next.js).

Deliberadamente **sin** `import "server-only"` — a diferencia de la
mayoría de `src/server/`. Los scripts de `scripts/` (y `prisma/seed.ts`)
reusan `server/services/*` fuera del bundler de Next (corridos con
`tsx` directo), y ese paquete revienta en cualquier Node plano, no solo en
un bundle de cliente. La barrera real contra que esto llegue al cliente
sigue siendo la regla ESLint de `src/components/**` (regla 6) — este
archivo específico solo necesita quedar libre para que los scripts lo
puedan importar.

`DATABASE_URL`/`DIRECT_DATABASE_URL` los toma del entorno — en
desarrollo, siempre el Postgres del contenedor `db` de
`docker-compose.yml` (`environment:` ahí gana sobre cualquier `.env`
montado).
