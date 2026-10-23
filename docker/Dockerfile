# Imagen de producción — multi-stage, standalone. node:22-bookworm-slim,
# NO Alpine: musl obliga a binaryTargets especiales para Prisma y a cazar
# el build correcto de @node-rs/bcrypt (ver docs/PLAN.md, riesgo #7).
FROM node:22-bookworm-slim AS base

# bookworm-slim no trae `openssl` — Prisma no puede detectar la versión de
# libssl y cae a un default que a veces no matchea el engine real.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# node_modules solo-producción para el runner. `output: "standalone"` sí
# trae @prisma/client (Next lo traza porque el código lo importa), pero el
# CLI de `prisma` (para `migrate deploy` en el arranque) no aparece en ese
# trace y arrastra su propia cadena de dependencias (@prisma/config,
# @prisma/engines, effect, ...) — cherry-picking carpeta por carpeta se
# rompe con cada dependencia transitiva nueva. Más simple y confiable:
# `npm ci --omit=dev` aparte y copiar ese node_modules completo encima del
# podado de standalone. `prisma` está en "dependencies" (no dev) a
# propósito: en esta imagen es un binario de runtime, no una herramienta
# de desarrollo.
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
# Solo este script, no todo scripts/: es el único que corre en producción
# (entrypoint.sh lo usa como pre-flight de las migraciones, ).
COPY --from=builder /app/scripts/verificar-preflight.ts ./scripts/verificar-preflight.ts
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

# 8080 y no 3000. Railway inyecta `PORT=8080` en el contenedor, y esa
# variable PISA el `ENV PORT` de la imagen — así que la app SIEMPRE escuchó
# en 8080 mientras la imagen declaraba 3000. El dominio público se creó
# leyendo el `EXPOSE 3000` y quedó apuntado al puerto equivocado: el edge
# rechazaba en ~240 ms sin llegar a la app. Esa fue la causa de fondo de
# todos los 502 de Fase 8, y convivía sin contradicción con un healthcheck
# en verde, que va por otra vía interna.
#
# Se arregló a mano desde la consola de Railway, que es exactamente el
# problema: ese arreglo no vive en el repo y se pierde si alguien recrea el
# servicio. Declarar 8080 aquí hace que la imagen diga la verdad y que el
# dominio se cree bien solo. La otra salida —fijar PORT=3000 como variable
# de Railway— también es un ajuste de consola que se pierde igual, así que
# no resuelve lo que hay que resolver.
EXPOSE 8080
ENV PORT=8080

# Obligatorio, no cosmético: el server.js de `output: standalone` hace
# `process.env.HOSTNAME || '0.0.0.0'`, y Docker define HOSTNAME solo con el
# ID del contenedor. Sin esta línea Next se enlaza a esa interfaz concreta
# en vez de a todas, la app arranca y responde "Ready", y el proxy de
# Railway igual recibe connection refused — un healthcheck que falla contra
# un proceso vivo. No se veía con `next start`, que ignora HOSTNAME.
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./entrypoint.sh"]
