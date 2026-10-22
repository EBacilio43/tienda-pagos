import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import { obtenerUsuarioParaEditar } from "@/server/services/usuarios";
import { resetearPasswordAction } from "@/server/actions/usuarios";
import { ResetearPasswordForm } from "@/components/resetear-password-form";
import { buttonVariants } from "@/components/ui/button";
import { ModalRuta } from "@/components/modal-ruta";

export default async function ResetearPasswordModal({
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
      <ModalRuta titulo={`Resetear contraseña: ${usuario.nombreCompleto}`}>
        <p className="text-sm text-muted-foreground">
          No puedes resetear tu propia contraseña desde aquí — usa &quot;Mi cuenta&quot;.
        </p>
        <div className="mt-4">
          <Link href="/mi-cuenta" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ir a Mi cuenta
          </Link>
        </div>
      </ModalRuta>
    );
  }

  return (
    <ModalRuta titulo={`Resetear contraseña: ${usuario.nombreCompleto}`}>
      <ResetearPasswordForm accion={resetearPasswordAction.bind(null, usuarioId)} />
    </ModalRuta>
  );
}
