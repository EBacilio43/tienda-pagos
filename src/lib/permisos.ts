import type { Rol } from "@/types/dominio";

// Fase 6: el gate real vive en cada servicio (AGENTS.md regla 7) — un
// Server Action con su ID descubierto en el bundle de producción y
// llamado directo (curl, sin pasar por la UI) debe recibir esto, no un
// redirect silencioso. `requireRole` en las páginas/actions sigue
// existiendo para UX; esto es lo que autoriza de verdad.
export class ErrorPermiso extends Error {
  constructor(mensaje = "No tienes permiso para realizar esta acción.") {
    super(mensaje);
    this.name = "ErrorPermiso";
  }
}

// ADR-09 / docs/DOMINIO.md. Isomórfico a propósito: la UI lo usa para
// esconder botones, los servicios para rechazar (AGENTS.md regla 7 — el
// gate real vive en el servicio, esto solo evita el viaje redondo en la UI).
export function puedeCrearEditarClientes(rol: Rol): boolean {
  return rol === "operador" || rol === "admin";
}

export function puedeEliminarClientes(rol: Rol): boolean {
  return rol === "admin";
}

export function puedeAjustarStock(rol: Rol): boolean {
  return rol === "operador" || rol === "admin";
}

export function puedeGestionarCatalogo(rol: Rol): boolean {
  return rol === "admin";
}

// ADR-09: crear/editar/eliminar ventas, pagos y devoluciones — fila propia
// de la matriz, coincide hoy con puedeCrearEditarClientes pero se nombra
// aparte porque son permisos distintos que podrían divergir.
export function puedeGestionarTransacciones(rol: Rol): boolean {
  return rol === "operador" || rol === "admin";
}

// ADR-09: usuarios, auditoría y sesiones — exclusivo de admin.
export function puedeGestionarUsuarios(rol: Rol): boolean {
  return rol === "admin";
}
