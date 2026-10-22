import { requireRole } from "@/server/auth/guards";
import { crearClienteAction } from "@/server/actions/clientes";
import { ClienteForm } from "@/components/cliente-form";
import { PageHeader } from "@/components/page-header";

export default async function NuevoClientePage() {
  await requireRole("operador", "admin");

  return (
    <div>
      <PageHeader titulo="Nuevo cliente" />
      <ClienteForm accion={crearClienteAction} textoBoton="Crear cliente" />
    </div>
  );
}
