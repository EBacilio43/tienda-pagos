// distingue un error de negocio (mensaje seguro de mostrar tal
// cual — "Stock insuficiente", "Ya existe un cliente con ese nombre") de
// un error inesperado (bug, Prisma, red), que nunca debe llegar crudo a la
// pantalla. Junto a `ErrorPermiso` (lib/permisos.ts) son los únicos dos
// tipos de error cuyo `.message` es seguro de devolver a un Server Action.
export class ErrorDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDominio";
  }
}
