// Hook oficial de arranque de Next.js — corre una sola vez, antes de que
// el servidor acepte requests. Fase 7 / AGENTS.md: la app debe rehusarse
// a arrancar si falta SESSION_SECRET, no fallar en silencio en el primer
// login (ver server/auth/session.ts, que lo usa como pepper HMAC).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim() === "") {
      throw new Error(
        "Falta SESSION_SECRET. La app no puede arrancar sin un secreto de sesión " +
          "configurado — generar uno con: openssl rand -base64 32 (ver .env.example)."
      );
    }
  }
}
