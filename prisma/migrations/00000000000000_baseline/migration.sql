-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150),
    "telefono" VARCHAR(20),
    "empresa" VARCHAR(150),
    "calle" VARCHAR(200),
    "num_ext" VARCHAR(20),
    "num_int" VARCHAR(20),
    "colonia" VARCHAR(100),
    "municipio" VARCHAR(100),
    "estado" VARCHAR(100),
    "cp" VARCHAR(10),
    "fecha_registro" TIMESTAMP(6),
    "absorbido_por" INTEGER,
    "fecha_absorcion" TIMESTAMP(6),

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "precio" DECIMAL(12,2),
    "descripcion" TEXT,
    "activo" BOOLEAN,
    "fecha_registro" TIMESTAMP(6),
    "notas" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "esquema_pago" VARCHAR(50),
    "frecuencia_pago" VARCHAR(50),
    "monto_total" DECIMAL(12,2),
    "tiene_enganche" BOOLEAN,
    "enganche" DECIMAL(12,2),
    "fecha_registro_sistema" TIMESTAMP(6),

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_articulos" (
    "id" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "cantidad" INTEGER,
    "precio_unitario" DECIMAL(12,2),

    CONSTRAINT "venta_articulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo_pago" VARCHAR(50),
    "referencia" VARCHAR(200),
    "notas" TEXT,
    "fecha_registro_sistema" TIMESTAMP(6),

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devoluciones" (
    "id" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT,
    "monto_credito" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_registro_sistema" TIMESTAMP(6),

    CONSTRAINT "devoluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion_articulos" (
    "id" SERIAL NOT NULL,
    "id_devolucion" INTEGER NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "cantidad" INTEGER,
    "precio_unitario" DECIMAL(12,2),

    CONSTRAINT "devolucion_articulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "herencias_cuenta" (
    "id" SERIAL NOT NULL,
    "id_cliente_origen" INTEGER NOT NULL,
    "id_cliente_destino" INTEGER NOT NULL,
    "fecha_herencia" TIMESTAMP(6),
    "notas" TEXT,

    CONSTRAINT "herencias_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nombre_completo" VARCHAR(100) NOT NULL,
    "email" VARCHAR(120),
    "rol" VARCHAR(20) NOT NULL,
    "activo" BOOLEAN NOT NULL,
    "intentos_fallidos" INTEGER NOT NULL,
    "bloqueado_hasta" TIMESTAMP(6),
    "ultimo_login" TIMESTAMP(6),
    "ultima_actividad" TIMESTAMP(6),
    "creado_en" TIMESTAMP(6) NOT NULL,
    "actualizado_en" TIMESTAMP(6),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones_log" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "username_intentado" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "exitoso" BOOLEAN NOT NULL,
    "motivo_falla" VARCHAR(100),
    "timestamp" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "sesiones_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "accion" VARCHAR(50) NOT NULL,
    "tabla_afectada" VARCHAR(50) NOT NULL,
    "registro_id" VARCHAR(50),
    "datos_anteriores" JSON,
    "datos_nuevos" JSON,
    "ip_address" VARCHAR(45),
    "timestamp" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ix_usuarios_username" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "ix_sesiones_log_timestamp" ON "sesiones_log"("timestamp");

-- CreateIndex
CREATE INDEX "ix_auditoria_timestamp" ON "auditoria"("timestamp");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_absorbido_por_fkey" FOREIGN KEY ("absorbido_por") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "venta_articulos" ADD CONSTRAINT "venta_articulos_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "devolucion_articulos" ADD CONSTRAINT "devolucion_articulos_id_devolucion_fkey" FOREIGN KEY ("id_devolucion") REFERENCES "devoluciones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "herencias_cuenta" ADD CONSTRAINT "herencias_cuenta_id_cliente_origen_fkey" FOREIGN KEY ("id_cliente_origen") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "herencias_cuenta" ADD CONSTRAINT "herencias_cuenta_id_cliente_destino_fkey" FOREIGN KEY ("id_cliente_destino") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sesiones_log" ADD CONSTRAINT "sesiones_log_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

