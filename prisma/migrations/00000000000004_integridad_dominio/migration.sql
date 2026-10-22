-- DropForeignKey
ALTER TABLE "devolucion_articulos" DROP CONSTRAINT "devolucion_articulos_id_devolucion_fkey";

-- DropForeignKey
ALTER TABLE "venta_articulos" DROP CONSTRAINT "venta_articulos_id_venta_fkey";

-- AlterTable
ALTER TABLE "devolucion_articulos" ADD COLUMN     "id_catalogo" INTEGER;

-- AlterTable
ALTER TABLE "venta_articulos" ADD COLUMN     "id_catalogo" INTEGER;

-- Backfill por nombre exacto — solo hay match cuando el nombre del artículo
-- de venta/devolución coincide con un artículo de catalogo hoy vigente.
-- Si no hay coincidencia, queda con id_catalogo NULL a propósito:
-- nombre/precio_unitario siguen siendo el snapshot histórico.
UPDATE "venta_articulos" va
SET "id_catalogo" = c.id
FROM "catalogo" c
WHERE c.nombre = va.nombre;

UPDATE "devolucion_articulos" da
SET "id_catalogo" = c.id
FROM "catalogo" c
WHERE c.nombre = da.nombre;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_nombre_key" ON "clientes"("nombre");

-- AddForeignKey
ALTER TABLE "venta_articulos" ADD CONSTRAINT "venta_articulos_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "venta_articulos" ADD CONSTRAINT "venta_articulos_id_catalogo_fkey" FOREIGN KEY ("id_catalogo") REFERENCES "catalogo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "devolucion_articulos" ADD CONSTRAINT "devolucion_articulos_id_devolucion_fkey" FOREIGN KEY ("id_devolucion") REFERENCES "devoluciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "devolucion_articulos" ADD CONSTRAINT "devolucion_articulos_id_catalogo_fkey" FOREIGN KEY ("id_catalogo") REFERENCES "catalogo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

