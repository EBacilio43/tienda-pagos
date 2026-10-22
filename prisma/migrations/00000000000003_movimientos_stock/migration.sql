-- CreateTable
CREATE TABLE "movimientos_stock" (
    "id" SERIAL NOT NULL,
    "id_catalogo" INTEGER NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "referencia_tipo" VARCHAR(50),
    "referencia_id" INTEGER,
    "delta" INTEGER NOT NULL,
    "actor_id" INTEGER,
    "notas" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_movimientos_stock_id_catalogo" ON "movimientos_stock"("id_catalogo");

-- AddForeignKey
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_id_catalogo_fkey" FOREIGN KEY ("id_catalogo") REFERENCES "catalogo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

