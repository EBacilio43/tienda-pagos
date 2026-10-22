import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerUsuarioParaEditar } from "@/server/services/usuarios";
import { actualizarUsuarioAction } from "@/server/actions/usuarios";
import { EditarUsuarioForm } from "@/components/editar-usuario-form";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole("admin");

  const { id } = await params;
  const usuarioId = Number(id);
  if (!Number.isInteger(usuarioId)) notFound();

  const usuario = await obtenerUsuarioParaEditar(usuarioId);
  if (!usuario) notFound();

  if (actor.id === usuarioId) {
    return (
      <div>
        <PageHeader titulo={`Editar usuario: ${usuario.nombreCompleto}`} />
        <p className="text-sm text-muted-foreground">
          No puedes editar tu propio usuario desde aquí — usa &quot;Mi cuenta&quot; para cambiar tu
          contraseña.
        </p>
        <div className="mt-4">
          <Link href="/mi-cuenta" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ir a Mi cuenta
          </Link>
        </div>
      </div>
    );
  }

  const accion = actualizarUsuarioAction.bind(null, usuarioId);

  return (
    <div>
      <PageHeader titulo={`Editar usuario: ${usuario.nombreCompleto}`} />
      <EditarUsuarioForm accion={accion} valoresIniciales={usuario} />
    </div>
  );
}
