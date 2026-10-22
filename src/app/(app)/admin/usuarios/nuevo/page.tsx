import { requireRole } from "@/server/auth/guards";
import { crearUsuarioAction } from "@/server/actions/usuarios";
import { UsuarioForm } from "@/components/usuario-form";
import { PageHeader } from "@/components/page-header";

export default async function NuevoUsuarioPage() {
  await requireRole("admin");

  return (
    <div>
      <PageHeader titulo="Nuevo usuario" />
      <UsuarioForm accion={crearUsuarioAction} textoBoton="Crear usuario" />
    </div>
  );
}
