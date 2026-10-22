import { requireRole } from "@/server/auth/guards";
import { crearClienteAction } from "@/server/actions/clientes";
import { ClienteForm } from "@/components/cliente-form";
import { ModalRuta } from "@/components/modal-ruta";

// Ruta interceptada de /clientes/nuevo. El permiso se revalida aquí igual
// que en la página completa: esto es una ruta de verdad, no una capa de
// presentación sobre otra, así que no hereda ningún chequeo (regla 7).
export default async function NuevoClienteModal() {
  await requireRole("operador", "admin");

  return (
    <ModalRuta titulo="Nuevo cliente">
      <ClienteForm accion={crearClienteAction} textoBoton="Crear cliente" />
    </ModalRuta>
  );
}
