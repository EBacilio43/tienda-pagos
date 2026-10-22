/**
 * Carga cuentas transcritas de libreta a la base. ESCRIBE.
 *
 * Uso: npx tsx scripts/cargar-cuenta.ts --actor <id> --confirmar <archivo.json> [...]
 *
 * Dos frenos a propósito:
 *
 * - Sin `--confirmar` hace un simulacro: valida, dice qué cargaría, y no
 *   escribe nada. Es el modo por default porque el destino habitual de este
 *   script es la base de producción real.
 * - `--actor` es obligatorio y no tiene default. Regla 5: todo servicio
 *   mutante recibe su actor y escribe auditoría con él. Un default silencioso
 *   dejaría filas de auditoría atribuidas a alguien que no hizo la carga, que
 *   es peor que no tenerlas.
 *
 * Cada archivo se carga en su propia transacción: una cuenta que falla no
 * arrastra a las demás, y las que ya entraron quedan.
 *
 * Para apuntarlo a producción, ver el encabezado de `borrar-cuenta.ts`: el
 * `environment:` de docker-compose fija la base local por diseño, y se
 * desactiva con `unset DATABASE_URL DIRECT_DATABASE_URL` para que
 * `dotenv/config` cargue las reales del `.env`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { esquemaCuentaLibreta } from "@/lib/schemas/libreta";
import { cargarCuentaDeLibreta } from "@/server/services/libretas";
import type { Rol } from "@/types/dominio";

const prisma = new PrismaClient();

function leerArg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const confirmar = process.argv.includes("--confirmar");
  const actorId = Number(leerArg("--actor"));
  const archivos = process.argv
    .slice(2)
    .filter((a) => a.endsWith(".json"));

  if (!Number.isInteger(actorId) || actorId <= 0) {
    console.error("Falta --actor <id>. Es el usuario al que se le atribuye la carga");
    console.error("en la auditoría (regla 5). Míralos con:");
    console.error("  npx tsx scripts/validar-cuenta.ts --clientes");
    process.exitCode = 1;
    return;
  }
  if (archivos.length === 0) {
    console.error("No diste ningún archivo .json.");
    process.exitCode = 1;
    return;
  }

  const actor = await prisma.usuario.findUnique({
    where: { id: actorId },
    select: { id: true, username: true, rol: true, activo: true },
  });
  if (!actor) {
    console.error(`No existe el usuario con id ${actorId}.`);
    process.exitCode = 1;
    return;
  }
  if (!actor.activo) {
    console.error(`El usuario ${actor.username} está desactivado.`);
    process.exitCode = 1;
    return;
  }

  const host = new URL(
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://desconocido"
  ).hostname;

  console.log(`Base   : ${host}`);
  console.log(`Actor  : #${actor.id} ${actor.username} (${actor.rol})`);
  console.log(`Modo   : ${confirmar ? "CARGA REAL" : "simulacro (sin --confirmar no escribe)"}`);
  console.log("");

  let cargadas = 0;
  let fallaron = 0;

  for (const ruta of archivos) {
    process.stdout.write(`${ruta} ... `);

    const parseado = esquemaCuentaLibreta.safeParse(
      JSON.parse(readFileSync(ruta, "utf8"))
    );
    if (!parseado.success) {
      console.log("NO CUMPLE EL CONTRATO. Corre validar-cuenta.ts para el detalle.");
      fallaron++;
      continue;
    }
    const cuenta = parseado.data;

    const apertura =
      cuenta.saldoInicial !== null && Number(cuenta.saldoInicial) !== 0
        ? ` + venta de apertura por saldo inicial de ${cuenta.saldoInicial}`
        : "";

    const resumen =
      `${cuenta.ventas.length} venta(s), ${cuenta.pagos.length} abono(s), ` +
      `${cuenta.devoluciones.length} devolución(es)${apertura}`;

    if (!confirmar) {
      const destino =
        cuenta.cliente.id !== null
          ? `cliente #${cuenta.cliente.id}`
          : `cliente NUEVO "${cuenta.cliente.nombre}"`;
      console.log(`cargaría ${resumen} a ${destino}`);
      continue;
    }

    try {
      const r = await cargarCuentaDeLibreta(
        { id: actor.id, rol: actor.rol as Rol },
        cuenta
      );
      console.log(
        `OK — cliente #${r.clienteId}${r.clienteCreado ? " (creado)" : ""}, ` +
          `${r.ventas} venta(s) con ${r.articulosVenta} artículo(s), ` +
          `${r.pagos} abono(s), ${r.devoluciones} devolución(es)` +
          `${r.ventaDeApertura ? ", + venta de apertura por saldo inicial" : ""}`
      );
      cargadas++;
    } catch (e) {
      console.log(`FALLÓ — ${(e as Error).message}`);
      console.log("  (la transacción hizo rollback: esta cuenta no quedó a medias)");
      fallaron++;
    }
  }

  console.log("");
  if (!confirmar) {
    console.log("Simulacro terminado. Nada se escribió.");
    console.log("Para cargar de verdad, repite el comando agregando --confirmar");
    return;
  }
  console.log(`${cargadas} cuenta(s) cargada(s), ${fallaron} con error.`);
  if (cargadas > 0) {
    console.log("Verifica las invariantes con: npm run verificar-saldos");
  }
  if (fallaron > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Error corriendo cargar-cuenta:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
