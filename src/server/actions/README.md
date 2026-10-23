# src/server/actions — Server Actions

Un archivo por entidad (`ventas.ts`, `pagos.ts`, `devoluciones.ts`,
`catalogo.ts`, `clientes.ts`, `usuarios.ts`, `sesiones.ts`, `actividad.ts`,
`auth.ts`, `tema.ts`), más `manejar-error.ts`, que no exporta una acción
sino el helper que todas las demás usan.

## El patrón, siempre igual

```ts
export async function crearXAction(_prevState, formData) {
  const actor = await requireUser();

  const datos = esquemaX.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await crearX({ id: actor.id, rol: actor.rol as Rol }, datos.data);
  } catch (err) {
    return { ok: false, mensaje: mensajeDeError(err, { accion: "crearX", actorId: actor.id }) };
  }

  revalidatePath(...);
  redirect(...);
}
```

Cuatro pasos, en ese orden: autenticar (no autorizar — eso lo hace el
servicio), validar forma con Zod, delegar al servicio dentro de un
`try/catch`, invalidar cache y redirigir. Ninguna acción de este
directorio contiene una regla de negocio — si empieza a acumular lógica
propia (más que armar el objeto que espera el servicio), esa lógica
probablemente pertenece en `server/services/`, no aquí.

## `manejar-error.ts`

El único punto donde un `catch` decide qué devolverle al usuario.
`ErrorPermiso`/`ErrorDominio` → su `.message` tal cual, es un mensaje de
negocio ya redactado para mostrarse. Cualquier otra cosa (Prisma, red, un
bug) → se registra con `server/log.ts` (actor, acción, ids relevantes) y
el usuario solo ve un mensaje genérico. Antes de esto, cada acción hacía
`err instanceof Error ? err.message : "..."` — el error se filtraba crudo
a la pantalla y, si era inesperado, no quedaba registrado en ningún lado
().

## Por qué `parsearArticulos`/`datosDelFormulario` se repiten por archivo

`ventas.ts` y `devoluciones.ts` cada uno tiene su propia
`parsearArticulos` (JSON en un input oculto — no hay forma limpia de
mandar un array anidado por `FormData` nativo) y `datosDelFormulario`. Se
repite el patrón a propósito en vez de compartir una función genérica: la
forma del `FormData` de cada entidad es distinta, y una abstracción que
las unificara sería la clase de generalización prematura que la regla 9
prohíbe — tres líneas parecidas es más barato que una función con
parámetros para adaptarse a cada caso.
