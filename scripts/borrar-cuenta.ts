/**
 * Borra clientes con toda su cuenta —ventas, abonos y devoluciones—. ESCRIBE,
 * y es el script más destructivo del repo.
 *
 * Uso: npx tsx scripts/borrar-cuenta.ts --actor <id> --confirmar <idCliente> [...]
 *      npx tsx scripts/borrar-cuenta.ts --actor 1 3 5 9      (simulacro)
 *
 * Existe por la migración de las libretas de papel: las cuentas capturadas a
 * mano en la app se reemplazan por las transcritas, y `clientes.nombre` es
 * UNIQUE, así que la vieja tiene que irse ANTES de que entre la nueva o la
 * carga falla a medio camino. Por la UI no se puede: `eliminarCliente` se
 * niega en cuanto hay un movimiento, que es la protección correcta para el
 * uso diario.
 *
 * Tres frenos, los mismos de `cargar-cuenta.ts` más uno:
 *
 * - Sin `--confirmar` hace un simulacro: dice a quién borraría, con cuántos
 *   movimientos y qué saldo, y no escribe nada. Es el modo por default porque
 *   el destino habitual de este script es la base de producción real.
 * - `--actor` es obligatorio y no tiene default. Regla 5: los renglones de
 *   auditoría que van a quedar son lo ÚNICO que sobrevive de esas filas, así
 *   que atribuirlos a quien no hizo el borrado es peor que no tenerlos.
 * - El simulacro imprime el nombre de cada cliente. Un id equivocado borra a
 *   la persona equivocada y no hay deshacer: el nombre es lo que se revisa.
 *
 * Cada cliente se borra en su propia transacción: uno que falla no arrastra a
 * los demás, y ninguno queda a medias.
 *
 * ## Cómo apuntarlo a una base remota
 *
 * `docker-compose.yml` fija `DATABASE_URL` al servicio `db` local en el
 * bloque `environment:`. Para correr este script contra una base remota,
 * se desactivan esas variables para que `dotenv/config` cargue las del `.env`:
 *
 *   docker compose exec -T app sh -c 'unset DATABASE_URL DIRECT_DATABASE_URL; \
 *     npx tsx scripts/borrar-cuenta.ts --actor <id> <ids...>'
 *
 * La primera línea que imprime el script es la base a la que se conectó.
 * **Léela antes de escribir `--confirmar`.**
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { eliminarCuentaCompleta } from "@/server/services/clientes";
import { obtenerSaldo } from "@/server/services/saldo";
import { decimalAString } from "@/lib/money";
import type { Rol } from "@/types/dominio";

const prisma = new PrismaClient();

function leerArg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const confirmar = process.argv.includes("--confirmar");
  const actorId = Number(leerArg("--actor"));

  const banderas = new Set(["--actor", "--confirmar"]);
  const ids = process.argv
    .slice(2)
    .filter((a, i, todos) => !banderas.has(a) && todos[i - 1] !== "--actor")
    .map(Number);

  if (!Number.isInteger(actorId) || actorId <= 0) {
    console.error("Falta --actor <id>. Es el usuario al que se le atribuye el");
    console.error("borrado en la auditoría (regla 5). Míralos con:");
    console.error("  npx tsx scripts/validar-cuenta.ts --clientes");
    process.exitCode = 1;
    return;
  }
  if (ids.length === 0 || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    console.error("Dame al menos un id de cliente. Míralos con:");
    console.error("  npx tsx scripts/validar-cuenta.ts --clientes");
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
  console.log(`Modo   : ${confirmar ? "BORRADO REAL" : "simulacro (sin --confirmar no escribe)"}`);
  console.log("");

  if (!confirmar) {
    // El simulacro lee lo mismo que va a borrar el servicio, para que lo que
    // se revisa aquí sea lo que va a desaparecer y no una aproximación.
    let totalFilas = 0;
    for (const id of ids) {
      const cliente = await prisma.cliente.findUnique({
        where: { id },
        select: {
          nombre: true,
          _count: { select: { ventas: true, pagos: true, devoluciones: true } },
        },
      });
      if (!cliente) {
        console.log(`  #${id} — NO EXISTE`);
        continue;
      }
      // Regla 3: el saldo sale de `saldo.ts`, no se recalcula aquí.
      const saldo = decimalAString(await obtenerSaldo(id));
      const c = cliente._count;
      totalFilas += 1 + c.ventas + c.pagos + c.devoluciones;
      console.log(
        `  #${id} ${cliente.nombre}\n` +
          `      ${c.ventas} venta(s), ${c.pagos} abono(s), ${c.devoluciones} devolución(es)` +
          `   saldo ${saldo}`
      );
    }
    console.log("");
    console.log(`Se borrarían ${ids.length} cliente(s) y ${totalFilas} fila(s) en total.`);
    console.log("REVISA LOS NOMBRES. Un id equivocado borra a otra persona y no hay deshacer.");
    console.log("Si son los correctos, repite el comando agregando --confirmar");
    return;
  }

  let borrados = 0;
  let fallaron = 0;

  for (const id of ids) {
    process.stdout.write(`#${id} ... `);
    try {
      const r = await eliminarCuentaCompleta(
        { id: actor.id, rol: actor.rol as Rol },
        id
      );
      console.log(
        `OK — "${r.nombre}" borrado con ${r.ventas} venta(s), ${r.pagos} abono(s), ` +
          `${r.devoluciones} devolución(es). Saldo que tenía: ${r.saldoQueTenia}`
      );
      borrados++;
    } catch (e) {
      console.log(`FALLÓ — ${(e as Error).message}`);
      console.log("  (la transacción hizo rollback: esta cuenta quedó intacta)");
      fallaron++;
    }
  }

  console.log("");
  console.log(`${borrados} cliente(s) borrado(s), ${fallaron} con error.`);
  if (borrados > 0) {
    console.log("Verifica las invariantes con: npm run verificar-saldos");
  }
  if (fallaron > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Error corriendo borrar-cuenta:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
