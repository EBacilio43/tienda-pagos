-- P11: Claves de idempotencia contra doble clic concurrente (< 1 ms).
-- Garantiza que peticiones duplicadas de venta, pago o devolución
-- sean rechazadas por conflicto de clave primaria en la base de datos,
-- evitando escrituras duplicadas de saldo y stock.
CREATE TABLE "idempotencia_tokens" (
    "token" VARCHAR(64) NOT NULL,
    "accion" VARCHAR(64) NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotencia_tokens_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "ix_idempotencia_tokens_expira_en" ON "idempotencia_tokens"("expira_en");
