# src/server/audit — el INSERT de auditoría compartido

Un archivo, `registrar.ts`, una función: `registrarAuditoria(db, params)`.

Regla 5 de `AGENTS.md`: todo servicio mutante escribe su renglón de
auditoría **dentro de la misma transacción** que su mutación, después de
conocer el id del registro afectado — así `registro_id` nunca queda
`null` en un `INSERT`, a diferencia del legacy (`audit.py:54`, donde sí
podía quedar así). `db` acepta tanto el cliente de Prisma normal como un
`Prisma.TransactionClient`, precisamente para poder llamarse desde dentro
de un `prisma.$transaction(async (tx) => ...)` de cualquier servicio.

No confundir con `server/services/auditoria.ts` — ese es el lado de
**lectura** (la página `admin/auditoria`, paginada). Este archivo es el
único lado de **escritura**; ningún servicio hace su propio
`prisma.auditoria.create(...)` a mano.
