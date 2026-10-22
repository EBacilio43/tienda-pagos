// Sustituto vacío de `server-only` para las pruebas (ver vitest.config.ts).
//
// El paquete real no exporta nada: existe solo para reventar cuando un
// bundler lo resuelve fuera de la condición "react-server", que es como
// impide que un módulo de servidor acabe en el bundle del cliente. Vitest
// no construye ningún bundle de cliente, así que ahí solo estorba — y sin
// este archivo, `server/auth/*` (que sí lo importa, a diferencia de
// `server/db/prisma.ts`) no se puede probar en absoluto.
//
// Esto NO debilita la regla 6: la barrera real contra que código de
// servidor llegue al cliente es la regla ESLint `no-restricted-imports` de
// eslint.config.mjs sobre `src/components/**`, que sigue intacta y sí
// falla el CI. Lo dice también el comentario de cabecera de
// `src/server/db/prisma.ts`.
export {};
