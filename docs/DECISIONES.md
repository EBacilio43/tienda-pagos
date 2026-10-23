# DECISIONES — ADRs

Decisiones tomadas antes de empezar la migración. No se re-litigan sin una
razón nueva y documentada; si algo cambia, se añade un ADR nuevo, no se edita
uno viejo.

---

### ADR-01 — Repo nuevo, no migración in-place

**Decisión:** el sistema se reconstruye en un repositorio limpio e independiente,
sin arrastrar la deuda técnica de plantillas anteriores.

**Por qué:** la UI vive en un solo archivo de 2839 líneas con 9 diálogos
apilados sobre una plantilla RPA a medio limpiar; no hay una ruta de
refactor incremental razonable hacia Next.js. Empezar limpio es más barato
que desenredar.

---

### ADR-02 — Next.js 15 full-stack, monolito

**Decisión:** App Router. Server Components para lectura, Server Actions
para mutaciones, Route Handlers para JSON interactivo y binarios (PDF). Un
solo contenedor Docker.

**Por qué:** el sistema es CRUD + reportes para un negocio pequeño, un solo
equipo. Separar frontend/backend en servicios distintos añade complejidad
operativa (dos despliegues, CORS, versión de contrato) sin un beneficio real
a esta escala.

---

### ADR-03 — Preservar el esquema de BD, migrar datos, no resetear

**Decisión:** `prisma db pull` sobre el esquema real; los defectos se
corrigen con migraciones nuevas encima, no recreando la BD desde un modelo
ideal. Cero pérdida de datos, cero reseteo de contraseñas de usuario.

**Por qué:** hay datos de producción reales (clientes, ventas, historial de
pagos) que no se pueden perder ni reconciliar a mano. `usuarios.password_hash`
en particular se preserva bit a bit — nadie vuelve a loguearse con contraseña
nueva.

---

### ADR-04 — Alcance: paridad 1:1 + bugs corregidos + RBAC real + admin de usuarios

**Decisión:** no se agregan features de negocio nuevas (reportes nuevos,
flujos nuevos) en esta migración. Sí se agregan: aplicación real de permisos
(hoy modelados pero sin call sites), pantalla de administración de usuarios
(hoy requiere SSH y un script), y la corrección de los defectos listados en
la tabla "Dónde se arregla cada defecto" del plan.

**Por qué:** mezclar "reescribir la plataforma" con "agregar features" hace
imposible saber si un bug nuevo viene de la migración o de la feature. Se
migra primero, se itera después.

---

### ADR-05 — Rediseño visual libre (shadcn/ui + Tailwind)

**Decisión:** no se clona el look de NiceGUI. Sidebar persistente en vez de
diálogos apilados sobre una sola página.

**Por qué:** los 9 diálogos apilados son un artefacto de que NiceGUI hace
modales fáciles y rutas difíciles. Next.js es al revés — rutas reales son el
camino natural, y eso mejora deep-linking, back-button, y la carga cognitiva
de "dónde estoy".

---

### ADR-06 — Desktop-first, responsive real

**Decisión:** el diseño prioriza escritorio (es como se usa hoy, en el
mostrador/oficina del negocio) pero funciona en tablet/móvil sin romperse.

**Por qué:** el uso real es desktop. Responsive real es una red de
seguridad, no el caso de uso principal — no vale la pena invertir en
mobile-first para un flujo que nadie usa desde el celular.

---

### ADR-07 — Se elimina el panel RPA

**Decisión:** se borra `BaseRobotLogic`, `execute_process` y el panel RPA
(`gui.py:2474-2496`) sin equivalente en el sistema nuevo.

**Por qué:** es plantilla sobrante de la base RPA original sobre la que se
construyó el sistema. No tiene usuarios ni caso de uso — es peso muerto.

---

### ADR-08 — Docker para desarrollo local

**Decisión:** `docker-compose.yml` con `app` + `postgres:16` + `adminer`
(profile `tools`). Entorno reproducible desde `git clone` hasta `docker
compose up`.

**Por qué:** el bug de mayor severidad del sistema anterior (el PDF nunca le
llega al usuario en un entorno web remoto) viene de asumir un entorno local que no existe
en producción. Un entorno de desarrollo que se parece a producción hace que
esa clase de bug se vea antes de desplegar.

---

### ADR-09 — Matriz de permisos: consulta / operador / admin

**Decisión:**
- `consulta`: solo lectura.
- `operador`: crea, edita **y elimina** ventas, pagos y devoluciones.
- `admin`: además elimina clientes y gestiona catálogo, usuarios y
  auditoría.

**Por qué:** refleja cómo ya está modelado el rol en `models.py`
(`RolUsuario`), simplemente aplicándolo de verdad. Ver la matriz completa en
`docs/DOMINIO.md`.

---

### ADR-10 — Alta de venta en una sola página, no wizard

**Decisión:** el flujo de 6 pasos de `VentaWizardDialog` se colapsa a un
formulario de una sola página.

**Por qué:** el wizard existe porque tenía que caber en un modal de NiceGUI.
En una ruta propia con más espacio horizontal, un formulario de una página
con secciones es más rápido de operar y más fácil de revisar antes de
enviar.

---

### ADR-11 — Se abandona el `.exe` de PyInstaller

**Decisión:** `build_exe.py` y el empaquetado de escritorio no tienen
equivalente en el sistema nuevo.

**Por qué:** el sistema corre exclusivamente como servicio web centralizado.
Es otro artefacto de una etapa anterior del proyecto.

---

### ADR-12 — Ejecución fase por fase, con aprobación entre cada una

**Decisión:** el desarrollo se ejecuta en fases progresivas. Al cerrar cada una: se
verifica su criterio de "Listo cuando" y
se detiene para revisión antes de continuar.

**Por qué:** es un proyecto de ~24 días con decisiones que se acumulan (Fase
4, el núcleo transaccional, depende de que Fase 2 y 3 estén bien cerradas).
Avanzar sin checkpoints arriesga construir varias fases sobre un supuesto
equivocado de una fase anterior.

---

### ADR-13 — Datos: Prisma 6, no Drizzle

**Decisión:** `prisma migrate diff --from-empty --to-schema-datamodel`
genera el baseline SQL real que Alembic nunca tuvo.

**Por qué:** el baseline actual de Alembic (`e18341e3d10e`) es un `pass`
vacío — `alembic upgrade head` no puede crear la BD desde cero. Prisma
resuelve esto directamente porque el baseline se deriva del esquema
introspeccionado, no se escribe a mano. Drizzle no tiene un equivalente de
primera clase para este flujo.

---

### ADR-14 — Dinero: `Decimal`, serializado como `string`

**Decisión:** se descarta centavos-como-entero. `Numeric(12,2)` en Postgres
se mantiene; la aritmética usa `Decimal` en el servidor y cruza a `string`
en la frontera RSC.

**Por qué:** migrar a centavos-enteros requeriría `ALTER TABLE` sobre datos
productivos, en contra de ADR-03. El problema nunca fue el tipo de columna —
fue `float(v.monto_total or 0)` en `logic.py:66`, que Decimal + string
elimina sin tocar el esquema.

---

### ADR-15 — Auth: sesiones opacas propias, no Auth.js v5

**Decisión:** tabla `sesiones` con `token_hash` (SHA-256), cookie `httpOnly
· Secure · SameSite=Lax`, validación contra BD en cada request vía
`React.cache()`.

**Por qué:** el Credentials provider de Auth.js v5 fuerza `strategy: "jwt"`,
y JWT no se puede revocar antes de que expire. El sistema actual sí revoca
de facto (`middleware.py:34-60` valida contra BD en cada request) —
adoptar Auth.js sería un retroceso de seguridad real, no cosmético.

---

### ADR-16 — PDF: `@react-pdf/renderer`, no Puppeteer ni print-CSS

**Decisión:** `renderToStream()` → streaming directo al `Response`, nunca
toca disco.

**Por qué:** el documento es una tabla de datos, no una página web
arbitraria — el sweet spot de react-pdf. Puppeteer agrega +400MB a la imagen
y arriesga OOM con generación concurrente, para un solo tipo de reporte.
Como beneficio adicional, react-pdf no parsea HTML, así que la inyección
HTML de `logic.py:928-943` desaparece por construcción, no por sanitización.

---

### ADR-17 — Sistema de diseño con tokens, marca azul grisáceo y modo oscuro sin dependencias

**Decisión:** la app tiene un único origen de color, `:root`/`.dark` en
`src/app/globals.css`, en OKLCH y en hue 258. La marca es un azul grisáceo
que **no se inventa**: es el mismo cromo que el PDF de Fase 5 ya usaba y que
el usuario ya aprobó (`navy900`/`navy700`/`ink`/`line`/`paperMuted`). Se
separan dos familias: **cromo** (marca, superficies, foco) y **datos** (los
cinco tipos de movimiento de `docs/DOMINIO.md`: venta, enganche, abono,
devolución, saldo). Un color literal en `src/` queda prohibido por la regla
dura 10 de `AGENTS.md` y por la regla ESLint `no-restricted-syntax`. Tres
estados de tema (claro/oscuro/sistema) en una cookie leída por el layout
raíz; "sistema" lo resuelve `@media (prefers-color-scheme: dark)` en el
propio CSS. Sin `next-themes`, sin script inline, sin ninguna dependencia
nueva. Detalle completo en `docs/DISENO.md`.

**Por qué:**
1. ADR-05 dejó el rediseño visual libre, pero el proyecto se quedó con los
   tokens de fábrica de shadcn — croma 0 en todos, sin marca real.
2. La paleta de los cinco movimientos ya existía en tres superficies
   (pantalla, resumen del cliente, PDF) y era la única parte de la app con
   identidad real; tokenizarla las vuelve la misma paleta en las tres en vez
   de tres copias que alguien tiene que mantener sincronizadas a mano.
3. `text-green-600`/`text-red-600` (los literales que existían antes) dan
   ~2.3:1 de contraste sobre fondo oscuro — falla AA. Un token con valor
   propio por modo no puede fallar así por construcción.
4. `next-themes` requeriría un script inline para evitar parpadeo, y la CSP
   con nonce por request de Fase 7 (regla dura 7) haría de esa una excepción
   permanente en la política de seguridad por una preferencia visual — mal
   negocio para lo que resuelve.
5. Se descarta `light-dark()` (que evitaría duplicar el bloque de tokens
   oscuros) porque el sistema usa modificadores de opacidad Tailwind en todo
   el código base (`bg-primary/80`, `ring-ring/50`), que compilan a
   `color-mix()`; anidar `light-dark()` dentro de `color-mix()` tiene
   soporte de navegador irregular y falla en silencio. La duplicación que sí
   queda la prueba `scripts/verificar-tokens.ts`.

**Alcance de la regla 10:** no aplica a `src/server/pdf/*`, que no puede
leer variables CSS de todos modos; ahí `paleta.ts` es el espejo a mano y
`scripts/verificar-paleta.ts` prueba que es la conversión exacta de
`:root`.

---

### ADR-18 (ADR-11 Arquitectura) — Prevención de colisiones en abonos simultáneos y estrategia de comunicación en tiempo real

**Decisión:** Se adopta **Control de Concurrencia Optimista (OCC)** con validación de saldo esperado en transacciones atómicas de base de datos (`prisma.$transaction`), complementado con **claves de idempotencia (`Idempotency-Key`)**, ventana de deduplicación temporal (5 minutos) en Server Actions y revalidación al enfoque (`revalidateOnFocus`) en dispositivos móviles.

Se **descarta formalmente el uso de WebSockets dedicados** y el uso de **CDC/Realtime externo en el cliente** para la gestión de transacciones.

**Por qué:**
1. Los WebSockets y el CDC de base de datos son mecanismos de notificación visual que no previenen condiciones de carrera transaccionales concurrentes ni toleran la intermitencia y caída de red celular (3G/4G) habitual en rutas de cobranza en campo.
2. La integridad financiera y la fórmula del saldo (Reglas 1 y 3) exigen validación atómica en el servidor; la transacción de PostgreSQL es el único punto infalible para evitar cobros dobles accidentales o saldos desactualizados.
3. Resuelve de forma definitiva el análisis de concurrencia respetando la Regla 9 de `AGENTS.md` (sin abstracciones especulativas), sin añadir costos operativos de infraestructura ni degradar la batería y datos móviles de los cobradores.

El análisis técnico exhaustivo, la comparativa de las cuatro tecnologías (WebSockets, Supabase Realtime, SSE/Polling y OCC), las matrices de decisión y el plan de migración por fases viven en [`docs/ADR-11-concurrencia-y-comunicacion-realtime.md`](ADR-11-concurrencia-y-comunicacion-realtime.md).

