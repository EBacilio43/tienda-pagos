import { requireRole } from "@/server/auth/guards";
import { obtenerSnapshotSistema } from "@/server/services/sistema";
import { PageHeader } from "@/components/page-header";
import { PanelSistema } from "@/components/panel-sistema";

// Cada visita mide de nuevo: un snapshot cacheado de hace un minuto no es
// una versión vieja de la verdad, es una mentira sobre el estado de ahora.
export const dynamic = "force-dynamic";

export default async function AdminSistemaPage() {
  await requireRole("admin");

  const snapshot = await obtenerSnapshotSistema();

  return (
    <div>
      <PageHeader
        titulo="Sistema"
        descripcion="Memoria, CPU, base de datos y tiempos de respuesta de esta instancia"
        volver={false}
      />

      <PanelSistema inicial={snapshot} />
    </div>
  );
}
