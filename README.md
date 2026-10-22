# Tienda Pagos

Sistema de punto de venta (POS) y gestión de ventas a crédito personal para comercios minoristas y joyerías. Un cliente adquiere artículos a crédito, puede entregar un enganche inicial y va abonando con pagos libres flexibles hasta saldar — sin intereses, sin tablas de amortización prefijadas y con cálculo de saldo unificado (*running balance*).

Para el modelo de negocio en detalle — fórmula del saldo, semántica de cada movimiento y flujo transaccional — consultar [`docs/DOMINIO.md`](docs/DOMINIO.md).

---

## Características principales

* **Arquitectura moderna:** Next.js 15 (App Router) en contenedor Docker único, aprovechando React Server Components (RSC) y Server Actions con validación estricta vía Zod.
* **Integridad financiera:**
  * Regla de dinero: tipo `Decimal` en el servidor (`src/lib/money.ts`), `string` en la frontera RSC, evitando cualquier pérdida de precisión por punto flotante.
  * Invariante de saldo: cálculo centralizado exclusivamente en `src/server/services/saldo.ts` y respaldado por la vista SQL `v_saldos_cliente`.
  * Rastro de inventario inmutable: cada variación de stock genera un `movimiento_stock` transaccional (`stock == SUM(movimientos_stock.delta)`).
  * Control de concurrencia optimista (OCC) y tokens de idempotencia para prevenir duplicación de cobros o abonos en condiciones de red inestable ([ADR-11](docs/ADR-11-concurrencia-y-comunicacion-realtime.md)).
* **Seguridad y auditoría:**
  * Autenticación con sesiones en base de datos, cookies seguras `httpOnly`, rate limiting y bloqueo ante intentos fallidos de login.
  * Todo servicio mutante registra obligatoriamente su rastro en `auditoria` dentro de la misma transacción.
* **Reportes y documentos:** Generación y streaming de estados de cuenta en PDF directamente desde el servidor utilizando `@react-pdf/renderer` y tokens de color semánticos compartidos.
* **Diseño ergonómico y accesible:** Tailwind CSS v4, componentes primitivos `@base-ui/react`, modo oscuro sin parpadeo y soporte completo para dispositivos móviles en campo.

---

## Stack tecnológico

* **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
* **Lenguaje:** TypeScript 5.8 (modo estricto)
* **Base de datos & ORM:** PostgreSQL 17 + [Prisma 6](https://www.prisma.io/)
* **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/) + tokens semánticos OKLCH
* **Validación:** [Zod 4](https://zod.dev/)
* **Testing:** [Vitest](https://vitest.dev/) (unitarias e integración) + [Playwright](https://playwright.dev/) (E2E)
* **Infraestructura:** Docker Compose

---

## Arranque rápido

### Prerrequisitos
* Docker y Docker Compose instalados.
* Node.js 22 (si deseas ejecutar comandos en host).

### 1. Clonar y configurar entorno
```bash
cp .env.example .env.local
```

### 2. Levantar los servicios
```bash
docker compose up -d
```
Esto levantará:
* **PostgreSQL local (`db`):** Puerto `5433` (interno 5432).
* **Aplicación Next.js (`app`):** Puerto `3000` con recarga en vivo (hot reload).
* Las migraciones de Prisma se ejecutan automáticamente al arrancar.

### 3. Poblar datos iniciales de prueba (Seed)
```bash
docker compose exec app npm run db:seed
```
Crea un usuario administrador inicial (`admin` / `Admin123!`), artículos de catálogo y casos de prueba financieros.

---

## Scripts y comandos frecuentes

Todos los comandos se ejecutan dentro del contenedor:

```bash
docker compose exec app <comando>
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Next.js con hot reload) |
| `npx tsc --noEmit` | Verificación estricta de tipos de TypeScript |
| `npx eslint .` | Verificación de reglas de linting y restricciones arquitectónicas |
| `npm test` | Pruebas unitarias de lógica pura (`tests/unit/`) |
| `npm run test:integration` | Pruebas de integración contra base de datos aislada (`tests/integration/`) |
| `npm run test:e2e` | Flujos de prueba de extremo a extremo con Playwright |
| `npm run verificar-saldos` | Verificación de invariante de saldo contra la base de datos |
| `npm run verificar-stock` | Verificación de consistencia de stock vs. suma de movimientos |
| `npm run podar-logs` | Mantenimiento y depuración de logs de sesión y auditoría antiguos |
| `npm run build` | Compilación de producción |

---

## Estructura del proyecto

```
src/
├── app/            # Rutas y páginas (Next.js App Router)
├── components/     # Componentes visuales y composiciones de interfaz
├── lib/            # Utilidades puras, esquemas Zod e invariantes de dinero/fecha
├── server/         # Código exclusivo de servidor (Node.js runtime)
│   ├── actions/    # Server Actions (validación de entrada y control de roles)
│   ├── services/   # Lógica central del dominio (saldo, stock, ventas, pagos)
│   ├── auth/       # Sesiones, permisos y seguridad de credenciales
│   ├── pdf/        # Generación y streaming de estados de cuenta PDF
│   └── db/         # Instancia y conexión de Prisma
└── types/          # DTOs y tipos que cruzan la frontera Server → Client

prisma/             # Esquema de base de datos, migraciones SQL y seed
tests/              # Pruebas unitarias, integración y pruebas E2E
docs/               # Documentación arquitectónica y de diseño
```

---

## Documentación técnica

| Documento | Contenido |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Invariantes duras del sistema, reglas de arquitectura y flujo de ramas |
| [`docs/DOMINIO.md`](docs/DOMINIO.md) | Definición formal del modelo de negocio, fórmulas y semántica financiera |
| [`docs/DECISIONES.md`](docs/DECISIONES.md) | Registro de Decisiones de Arquitectura (ADR-01 al ADR-17) |
| [`docs/ADR-11-concurrencia-y-comunicacion-realtime.md`](docs/ADR-11-concurrencia-y-comunicacion-realtime.md) | Análisis de concurrencia, idempotencia y tolerancia a desconexión |
| [`docs/DISENO.md`](docs/DISENO.md) | Sistema de diseño, tokens OKLCH y paleta semántica |

---

## Licencia

Distribuido bajo la Licencia MIT. Consulta el archivo `LICENSE` para más información.
