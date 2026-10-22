/**
 * Fase 0. Solo lectura — nunca escribe. Detecta clientes homónimos en
 * producción antes de poner un UNIQUE INDEX sobre clientes.nombre
 * (migración `integridad_dominio`, Fase 4). Si hay duplicados, el sistema
 * legacy ya les está atribuyendo mal ventas/pagos hoy (`Cliente.nombre ==`
 * en logic.py:366, :483, :557) — hay que reconciliar con el dueño del
 * negocio antes de que el índice bloquee altas nuevas.
 *
 * Uso: pnpm detectar-duplicados   (lee DIRECT_DATABASE_URL o DATABASE_URL de .env)
 */
import "dotenv/config";
import { Client } from "pg";

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "Falta DIRECT_DATABASE_URL o DATABASE_URL en el entorno (.env)."
  );
  process.exit(1);
}

type FilaExacta = {
  nombre: string;
  cantidad: string;
  ids: number[];
};

type FilaLaxa = {
  nombre_normalizado: string;
  cantidad: string;
  variantes: string[];
  ids: number[];
};

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log("Conectado. Corriendo consultas de solo lectura...\n");

    const totalClientes = await client.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM clientes"
    );
    console.log(`Total de clientes en producción: ${totalClientes.rows[0].total}\n`);

    // 1) Duplicados EXACTOS (mismo string, byte a byte) — el bloqueante real
    //    para el UNIQUE INDEX sin transformación previa.
    const exactos = await client.query<FilaExacta>(`
      SELECT nombre,
             COUNT(*)::text AS cantidad,
             array_agg(id ORDER BY id) AS ids
      FROM clientes
      GROUP BY nombre
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, nombre
    `);

    console.log(`=== Duplicados EXACTOS (nombre idéntico): ${exactos.rowCount} grupo(s) ===`);
    if (exactos.rowCount) {
      for (const fila of exactos.rows) {
        console.log(`  "${fila.nombre}" — ${fila.cantidad} registros — ids: [${fila.ids.join(", ")}]`);
      }
    } else {
      console.log("  Ninguno.");
    }

    // 2) Duplicados LAXOS: mismo nombre ignorando mayúsculas/minúsculas,
    //    espacios repetidos/extremos y acentos. Estos no bloquean un índice
    //    UNIQUE case-sensitive, pero probablemente son la misma persona
    //    capturada dos veces y ameritan revisión manual antes del cutover.
    const laxos = await client.query<FilaLaxa>(`
      SELECT
        lower(unaccent(trim(regexp_replace(nombre, '\\s+', ' ', 'g')))) AS nombre_normalizado,
        COUNT(*)::text AS cantidad,
        array_agg(DISTINCT nombre) AS variantes,
        array_agg(id ORDER BY id) AS ids
      FROM clientes
      GROUP BY nombre_normalizado
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, nombre_normalizado
    `).catch(async (err) => {
      // unaccent puede no estar habilitada como extensión en este proyecto.
      if (String(err).includes("unaccent")) {
        console.warn(
          "  (extensión `unaccent` no disponible — repitiendo sin normalizar acentos)\n"
        );
        return client.query<FilaLaxa>(`
          SELECT
            lower(trim(regexp_replace(nombre, '\\s+', ' ', 'g'))) AS nombre_normalizado,
            COUNT(*)::text AS cantidad,
            array_agg(DISTINCT nombre) AS variantes,
            array_agg(id ORDER BY id) AS ids
          FROM clientes
          GROUP BY nombre_normalizado
          HAVING COUNT(*) > 1
          ORDER BY COUNT(*) DESC, nombre_normalizado
        `);
      }
      throw err;
    });

    const laxosSoloDiferentes = laxos.rows.filter((f) => f.variantes.length > 1);

    console.log(
      `\n=== Duplicados LAXOS (mismo nombre salvo mayúsculas/espacios/acentos), ` +
      `excluyendo los ya listados como exactos: ${laxosSoloDiferentes.length} grupo(s) ===`
    );
    if (laxosSoloDiferentes.length) {
      for (const fila of laxosSoloDiferentes) {
        console.log(
          `  ${fila.cantidad}× — variantes: ${fila.variantes.map((v) => `"${v}"`).join(", ")} — ids: [${fila.ids.join(", ")}]`
        );
      }
    } else {
      console.log("  Ninguno.");
    }

    console.log("\n=== Resumen ===");
    console.log(`Grupos con duplicado exacto: ${exactos.rowCount}`);
    console.log(`Grupos con duplicado laxo (variante de mayúsculas/espacios/acentos): ${laxosSoloDiferentes.length}`);
    if (exactos.rowCount || laxosSoloDiferentes.length) {
      console.log(
        "\n⚠ Hay homónimos. Antes de aplicar el UNIQUE INDEX (migración " +
        "`integridad_dominio`) hay que reconciliar " +
        "cuáles son la misma persona (fusionar) y cuáles son " +
        "coincidencias de nombre legítimas (desambiguar)."
      );
    } else {
      console.log("\n✓ Sin homónimos. El UNIQUE INDEX se puede aplicar sin reconciliación previa.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error corriendo el detector de duplicados:", err);
  process.exit(1);
});
