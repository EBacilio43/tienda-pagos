import { hash, verify } from "@node-rs/bcrypt";

// rounds=12 para igualar los hashes $2b$12$... que ya existen en producción
// (bcrypt de Python) — ADR-15. Cero reseteo de contraseñas al migrar.
const ROUNDS = 12;

export function hashearPassword(password: string): Promise<string> {
  return hash(password, ROUNDS);
}

export function verificarPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return verify(password, passwordHash);
}
