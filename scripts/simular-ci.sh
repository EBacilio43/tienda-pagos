#!/usr/bin/env sh
# Simula .github/workflows/ci.yml localmente, ANTES de pushear.
# . Corre desde el host (Git Bash en Windows), orquestando Docker.
#
# Por qué no basta con correr tsc/eslint sueltos: las dos veces que el CI
# falló de verdad (2026-08-11) no fue por un comando malo, sino por el
# ESTADO y el ORDEN entre pasos —.next/types que no existe en un checkout
# fresco, y datos que una suite le deja a la siguiente—. Por eso esto
# replica la secuencia completa contra una base recreada desde cero, no
# una lista de comandos sueltos.
#
# Por qué no `act`: correría el YAML real (más fidelidad), pero exige
# instalar otro CLI y bajar imágenes grandes. Esto reusa el Docker que el
# proyecto ya necesita. Lo que este script NO valida es el YAML mismo —si
# se rompe la sintaxis del workflow o la config del service container, solo
# GitHub lo dirá.
set -eu

BASE_PRUEBA="tienda_test"
URL_PRUEBA="postgresql://tienda:tienda@db:5432/${BASE_PRUEBA}"
SECRETO="ci-dummy-secret-nunca-usado-en-produccion"

cd "$(dirname "$0")/.."

rojo()  { printf '\033[31m%s\033[0m\n' "$1"; }
verde() { printf '\033[32m%s\033[0m\n' "$1"; }
paso()  { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

# La red de seguridad de tests/integration/setup.ts previene truncar datos
# en bases no destinadas a pruebas. Aquí se hace un DROP DATABASE.
case "$BASE_PRUEBA" in
  tienda_test|*_test) ;;
  *) rojo "ABORTA: la simulación solo corre contra bases de prueba ('*_test'), no '${BASE_PRUEBA}'."; exit 1 ;;
esac

# Si package.json cambio (una dependencia nueva), la imagen de `app` tiene que
# reconstruirse ANTES de correr esto: los bloques de abajo usan `docker compose
# run`, que crea un node_modules nuevo DESDE LA IMAGEN en cada invocacion. Con
# la imagen vieja, tsc o el build fallan con un "Cannot find module" de algo
# que si esta instalado en el contenedor de desarrollo — un rojo que manda a
# buscar el bug al lugar equivocado. Se paga una vez con:
#   docker compose build app
if ! docker compose ps --status running --services 2>/dev/null | grep -q '^db$'; then
  rojo "El contenedor 'db' no está arriba. Corre: docker compose up -d db"
  exit 1
fi

# El servidor de desarrollo se detiene durante toda la simulación: compite
# por el volumen de .next y además fija
# NODE_ENV=development, que corrompe el prerenderizado del build de
# producción. El trap lo devuelve arriba pase lo que pase.
DEV_ESTABA_ARRIBA=0
if docker compose ps --status running --services 2>/dev/null | grep -q '^app$'; then
  DEV_ESTABA_ARRIBA=1
fi

restaurar() {
  codigo=$?
  if [ "$DEV_ESTABA_ARRIBA" = "1" ]; then
    printf '\n'
    paso "Devolviendo el servidor de desarrollo"
    docker compose up -d app >/dev/null 2>&1 || true
  fi
  if [ "$codigo" = "0" ]; then
    verde "
✓ La simulación pasó. El CI de GitHub debería pasar también."
  else
    rojo "
✗ La simulación FALLÓ (código $codigo). Arréglalo antes de pushear."
  fi
  exit $codigo
}
trap restaurar EXIT INT TERM

paso "Deteniendo el servidor de desarrollo"
docker compose stop app >/dev/null 2>&1 || true

# CI arranca con una base recién creada por el service container. Recrearla
# es lo que hace que el paso de migraciones pruebe algo: contra una base ya
# migrada, `migrate deploy` no haría nada y el baile del stub de
# alembic_version nunca se ejercitaría.
paso "Recreando ${BASE_PRUEBA} desde cero (como el service container del CI)"
docker compose exec -T db psql -U tienda -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${BASE_PRUEBA} WITH (FORCE);" \
  -c "CREATE DATABASE ${BASE_PRUEBA};" >/dev/null

# Todo lo demás corre en un contenedor efímero (--rm), no en el de
# desarrollo: es lo más cerca del runner limpio del CI que se puede sin act.
paso "Corriendo el workflow"
docker compose run --rm --no-deps \
  -e DATABASE_URL="$URL_PRUEBA" \
  -e DIRECT_DATABASE_URL="$URL_PRUEBA" \
  -e SESSION_SECRET="$SECRETO" \
  -e NODE_ENV=development \
  app sh -eu -c '
    echo "== prisma generate =="
    npx prisma generate >/dev/null

    echo "== baseline (falla a propósito en sesiones) =="
    npx prisma migrate deploy || true
  ' || exit 1

# El stub necesita psql, que no está en la imagen de la app — igual que en
# CI, donde este paso corre en el runner, no en un contenedor de Node.
paso "Stub de alembic_version"
docker compose exec -T db psql -U tienda -d "$BASE_PRUEBA" -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);" >/dev/null

docker compose run --rm --no-deps \
  -e DATABASE_URL="$URL_PRUEBA" \
  -e DIRECT_DATABASE_URL="$URL_PRUEBA" \
  -e SESSION_SECRET="$SECRETO" \
  -e NODE_ENV=development \
  app sh -eu -c '
    # `prisma generate` se repite en CADA bloque a propósito: node_modules
    # es un volumen ANÓNIMO (docker-compose.yml, obligatorio en Windows
    # para no pisar los binarios nativos), y `docker compose run --rm` crea
    # uno nuevo desde la imagen en cada invocación. Lo generado en el
    # bloque anterior se fue con su contenedor. En CI no pasa porque npm ci
    # y generate viven en el mismo runner.
    echo "== prisma generate =="
    npx prisma generate >/dev/null

    echo "== migrate resolve + deploy =="
    npx prisma migrate resolve --rolled-back 00000000000001_sesiones
    npx prisma migrate deploy

    # Reproduce el checkout fresco: .next/types NO existe en el runner, y
    # src/app/layout.tsx depende de LayoutProps<"/">, que solo genera Next.
    # Borrarlo antes es lo único que hace honesto al paso de typegen; sin
    # esto, tsc pasaría gracias a tipos que dejó `next dev` y el fallo
    # reaparecería solo en GitHub (que fue exactamente lo que pasó).
    echo "== simulando checkout fresco: borrando .next =="
    find .next -mindepth 1 -delete 2>/dev/null || true

    echo "== next typegen =="
    npx next typegen

    echo "== tsc =="
    npx tsc --noEmit

    echo "== eslint =="
    npx eslint .

    echo "== verificar-paleta / verificar-tokens =="
    npx tsx scripts/verificar-paleta.ts
    npx tsx scripts/verificar-tokens.ts

    echo "== pruebas unitarias =="
    npm test

    echo "== pruebas de integración =="
    npx vitest run tests/integration --no-file-parallelism

    # El orden importa: seed corre DESPUÉS de las pruebas, contra la misma
    # base. Si una suite deja datos huérfanos, seed se confunde y truena —
    # que es el segundo fallo real del CI, y solo se ve corriéndolos en
    # este orden.
    echo "== seed =="
    npx tsx prisma/seed.ts

    echo "== regresión de saldo y stock =="
    npx tsx scripts/verificar-saldos.ts
    npx tsx scripts/verificar-stock.ts
  ' || exit 1

paso "Build de producción"
docker compose run --rm --no-deps \
  -e DATABASE_URL="$URL_PRUEBA" \
  -e DIRECT_DATABASE_URL="$URL_PRUEBA" \
  -e SESSION_SECRET="$SECRETO" \
  -e NODE_ENV=production \
  app sh -eu -c 'npx prisma generate >/dev/null && npm run build' || exit 1

# Los flujos E2E van al final, igual que en el workflow. Si estuvieran en el
# CI y no aqui, esta simulacion dejaria de ser una puerta fiel — que es justo
# lo que P5 existe para evitar.
#
# DIFERENCIA CONSCIENTE con el CI, y conviene tenerla presente: alla los
# flujos corren contra el artefacto de produccion (.next/standalone) y aqui
# contra el dev server del perfil `e2e`. Que se cubran los dos modos es
# deseable, pero significa que un fallo que SOLO aparezca en el build de
# produccion lo dira GitHub y no esto. Reproducirlo aqui pediria levantar el
# standalone en un servicio aparte, con su propio HOSTNAME=0.0.0.0 y la copia
# de .next/static — se descarto por lo que cuesta frente a lo que agrega.
paso "Flujos E2E (perfil e2e, contra el dev server)"
docker compose --profile e2e run --rm --build e2e || exit 1
docker compose --profile e2e stop app-e2e >/dev/null 2>&1 || true
