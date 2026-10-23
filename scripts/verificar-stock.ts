/**
 * AGENTS.md regla 4: catalogo.stock == SUM(movimientos_stock.delta) para
 * cada artículo, siempre. Se encontró una violación real en Fase 3 (seed.ts
 * ponía stock directo sin movimiento) — este script existe para que no
 * vuelva a pasar en silencio.
 *
 * Uso: pnpm verificar-stock
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const articulos = await prisma.catalogo.findMany({
    select: { id: true, nombre: true, stock: true },
    orderBy: { id: "asc" },
  });

  let discrepancias = 0;

  for (const articulo of articulos) {
    const agregado = await prisma.movimientoStock.aggregate({
      _sum: { delta: true },
      where: { idCatalogo: articulo.id },
    });
    const sumaMovimientos = agregado._sum.delta ?? 0;

    if (sumaMovimientos !== articulo.stock) {
      discrepancias++;
      console.log(
        `✗ Artículo ${articulo.id} (${articulo.nombre}): stock=${articulo.stock} suma_movimientos=${sumaMovimientos}`
      );
    }
  }

  console.log(`\n${articulos.length} artículo(s) verificados, ${discrepancias} discrepancia(s).`);
  if (discrepancias > 0) {
    process.exitCode = 1;
  } else {
    console.log("✓ catalogo.stock == SUM(movimientos_stock.delta) para todos los artículos.");
  }
}

main()
  .catch((err) => {
    console.error("Error corriendo verificar-stock:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
