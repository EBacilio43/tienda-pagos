# src/server/auth — sesiones y control de acceso

## Sesiones — opacas, propias, no Auth.js

`session.ts`: `crearSesion`, `leerSesion` (envuelta en `React.cache()` —
una sola consulta por request aunque varios componentes la llamen),
`destruirSesionActual`. Sesión = token aleatorio en una cookie `httpOnly`,
guardado como `HMAC-SHA256(token, SESSION_SECRET)` en la tabla `sesiones`
— nunca el token en claro en la base (ADR-15). Cada request valida contra
la BD, no un JWT: desactivar un usuario o cerrarle la sesión desde
`admin/sesiones` le corta el acceso al instante, no cuando expire un
token que nadie puede revocar antes de tiempo. Expira por dos caminos —
absoluto (24h) e inactividad (8h) — y revisa `usuario.activo` en cada
lectura, en vivo.

## Autorización real — dos capas

- **`guards.ts`** — `requireUser()`/`requireRole(...)`, llamados desde
  los layouts/páginas de `src/app/`. Es la capa de UX: redirige a `/login`
  o a `/` si no aplica.
- **Cada servicio en `server/services/*.ts`** — el gate que de verdad
  importa (regla 7). `src/middleware.ts` explícitamente **no** autoriza,
  solo redirige por si falta la cookie — un header puede saltárselo
  (CVE-2025-29927). `guards.ts` tampoco es suficiente solo: un Server
  Action se puede invocar directo, sin pasar por ningún layout.

## Login y sus dos frenos anti-fuerza-bruta

`autenticar.ts` orquesta el login completo con dos mecanismos de seguridad:

- **`lockout.ts`** — por *cuenta*. 5 intentos fallidos bloquean el
  usuario 15 minutos. El legacy (`models.py:177-180`) nunca reseteaba el
  contador al expirar el bloqueo, así que un solo intento después de la
  ventana volvía a bloquear de inmediato — un trinquete permanente de "1
  intento cada 15 min" para siempre. Acá el contador se resetea primero
  si el bloqueo ya expiró, y *después* se cuenta el intento actual.
- **`rate-limit-ip.ts`** — por *IP*, no por cuenta. El lockout de arriba
  no protege contra alguien probando muchos usernames distintos (o que no
  existen, que nunca acumulan `intentos_fallidos`) desde la misma
  dirección. Reusa `sesiones_log` (que ya guarda IP y éxito de cada
  intento) en vez de mantener estado en memoria — sobrevive un restart
  del server sin infraestructura nueva.

Cada intento, exitoso o no, se registra en `sesiones_log` — es el mismo
log del que `scripts/podar-logs.ts` poda filas viejas (90 días).

## `password.ts`

`hashearPassword`/`verificarPassword` sobre `@node-rs/bcrypt`, `rounds =
12` — el mismo costo que los hashes `$2b$12$...` que ya existían en
producción (bcrypt de Python), para que la migración fuera cero-reseteo de
contraseñas (ADR-15).
