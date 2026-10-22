#!/bin/sh
set -e

# Pre-flight ANTES de migrar. .
#
# El CI corre `migrate deploy` contra una base VACÍA: ahí un UPDATE de
# normalización toca 0 filas, un CHECK se agrega a una tabla sin datos y un
# UNIQUE INDEX nunca encuentra duplicados. O sea, el modo de fallo que
# importa en una migración dependiente de datos es estructuralmente
# imposible de reproducir ahí — la luz verde del CI es honesta sobre la
# sintaxis y muda sobre los datos.
#
# Y aquí es donde eso duele: la línea de abajo corre en CADA arranque del
# contenedor. Una migración que revienta contra los datos reales no es un
# error que alguien lea con calma, es un despliegue caído — y peor, Prisma
# deja la migración fallida marcada como *errored* en `_prisma_migrations`,
# estado del que solo se sale a mano con `migrate resolve --rolled-back`,
# bloqueando mientras tanto todo deploy futuro.
#
# El script existía desde el 2026-08-18 y nadie lo corría: dependía de
# acordarse. Ponerlo aquí es lo que lo vuelve imposible de olvidar, porque
# es el MISMO proceso que va a migrar y contra la MISMA base. Si falla, el
# contenedor muere sin haber tocado `_prisma_migrations` — mismo tiempo
# fuera de servicio que la alternativa, pero sin el estado envenenado y con
# un mensaje que dice qué dato lo impidió.
#
# `npx` no sirve aquí: `output: standalone` no copia node_modules/.bin, así
# que no hay binario que resolver. Igual que con el CLI de prisma abajo, se
# invoca el entry point real (package.json#bin de tsx).
node node_modules/tsx/dist/cli.mjs scripts/verificar-preflight.ts

node node_modules/prisma/build/index.js migrate deploy
exec node server.js
