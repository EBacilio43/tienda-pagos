import { requireRole } from "@/server/auth/guards";
import { listarAuditoria, AUDITORIA_POR_PAGINA } from "@/server/services/auditoria";
import { PageHeader } from "@/components/page-header";
import { Paginacion } from "@/components/paginacion";
import { TablaAuditoria } from "@/components/tabla-auditoria";

function construirHref(pagina: number) {
  return `/admin/auditoria?pagina=${pagina}`;
}

export default async function AdminAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  await requireRole("admin");

  const params = await searchParams;
  const pagina = Number(params.pagina ?? "1") || 1;

  const { filas, total } = await listarAuditoria({ pagina });
  // Antes esto era un 40 literal escrito otra vez aquí: si el servicio
  // cambiaba de tamaño de página, el paginador seguía dividiendo por el
  // número viejo y prometía páginas que no existían.
  const totalPaginas = Math.max(1, Math.ceil(total / AUDITORIA_POR_PAGINA));

  return (
    <div>
      <PageHeader
        titulo="Auditoría"
        descripcion="Cada movimiento con su hora exacta, quién lo hizo y qué campos cambió"
        volver={false}
      />

      <TablaAuditoria filas={filas} />

      <Paginacion
        pagina={pagina}
        totalPaginas={totalPaginas}
        total={total}
        etiqueta={(n) => `${n} registros`}
        construirHref={construirHref}
      />
    </div>
  );
}
