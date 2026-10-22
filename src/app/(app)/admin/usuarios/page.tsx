import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireRole } from "@/server/auth/guards";
import { listarUsuarios } from "@/server/services/usuarios";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { UsuariosTarjetas } from "@/components/usuarios-tarjetas";

export default async function AdminUsuariosPage() {
  // requireRole devuelve el usuario de la sesión: se necesita para marcar
  // "Tú" en su tarjeta y llevarla a /mi-cuenta en vez de a un formulario
  // que el servicio va a rechazar (usuarios.ts prohíbe editarse a sí mismo).
  const actual = await requireRole("admin");

  const usuarios = await listarUsuarios();

  const enLinea = usuarios.filter((u) => u.estado === "en_linea").length;
  const desactivados = usuarios.filter((u) => u.estado === "desactivado").length;

  return (
    <div>
      <PageHeader
        titulo="Usuarios"
        descripcion={resumen(usuarios.length, enLinea, desactivados)}
        acciones={
          <Link href="/admin/usuarios/nuevo" className={buttonVariants({ size: "sm" })}>
            <UserPlus className="size-4" />
            Nuevo usuario
          </Link>
        }
        volver={false}
      />

      <UsuariosTarjetas usuarios={usuarios} usuarioActualId={actual.id} />
    </div>
  );
}

function resumen(total: number, enLinea: number, desactivados: number): string {
  const partes = [`${total} cuenta${total === 1 ? "" : "s"}`, `${enLinea} en línea`];
  if (desactivados > 0) partes.push(`${desactivados} desactivada${desactivados === 1 ? "" : "s"}`);
  return partes.join(" · ");
}
