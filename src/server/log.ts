// Registro estructurado de errores del servidor en formato JSON a stderr.
export function logError(contexto: Record<string, unknown>, error: unknown): void {
  const detalle =
    error instanceof Error
      ? { nombre: error.name, mensaje: error.message, stack: error.stack }
      : { valor: String(error) };

  console.error(
    JSON.stringify({
      nivel: "error",
      timestamp: new Date().toISOString(),
      ...contexto,
      error: detalle,
    })
  );
}
