import { requireRole } from "@/server/auth/guards";
import { crearUsuarioAction } from "@/server/actions/usuarios";
import { UsuarioForm } from "@/components/usuario-form";
import { ModalRuta } from "@/components/modal-ruta";

export default async function NuevoUsuarioModal() {
  await requireRole("admin");

  return (
    <ModalRuta titulo="Nuevo usuario">
      <UsuarioForm accion={crearUsuarioAction} textoBoton="Crear usuario" />
    </ModalRuta>
  );
}
