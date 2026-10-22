import { requireUser } from "@/server/auth/guards";
import { fechaHoraAString } from "@/lib/fecha";
import { CambiarPasswordForm } from "@/components/cambiar-password-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export default async function MiCuentaPage() {
  const usuario = await requireUser();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader titulo="Mi cuenta" className="mb-0" volver={false} />

      <Card>
        <CardHeader>
          <CardTitle>Datos de la cuenta</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Username</div>
            <div>{usuario.username}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Rol</div>
            <Badge variant="outline">{usuario.rol}</Badge>
          </div>
          <div>
            <div className="text-muted-foreground">Nombre completo</div>
            <div>{usuario.nombreCompleto}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Email</div>
            <div>{usuario.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Último login</div>
            <div className="tabular-nums whitespace-nowrap">
              {usuario.ultimoLogin ? fechaHoraAString(usuario.ultimoLogin) : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <CambiarPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
