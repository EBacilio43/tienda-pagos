import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Dato } from "@/components/dato";
import { RegistroAuditoria } from "@/components/registro-auditoria";
import { Currency } from "@/components/currency";
import { Fecha } from "@/components/fecha";
import { buttonVariants } from "@/components/ui/button";
import { obtenerPagoDetalle } from "@/server/services/pagos";
import { leerSesion } from "@/server/auth/session";
import { puedeGestionarTransacciones } from "@/lib/permisos";
import type { Rol } from "@/types/dominio";

export default async function PagoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pagoId = Number(id);
  if (!Number.isInteger(pagoId)) notFound();

  const pago = await obtenerPagoDetalle(pagoId);
  if (!pago) notFound();

  const usuario = await leerSesion();
  const rol = usuario?.rol as Rol | undefined;
  const puedeGestionar = rol ? puedeGestionarTransacciones(rol) : false;

  return (
    <div>
      <PageHeader
        titulo={`Abono #${pago.id}`}
        descripcion={
          <Link href={`/clientes/${pago.clienteId}`} className="hover:underline">
            {pago.clienteNombre}
          </Link>
        }
        acciones={
          puedeGestionar ? (
            <Link href={`/pagos/${pago.id}/editar`} className={buttonVariants({ size: "sm" })}>
              Editar
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Fecha" valor={<Fecha value={pago.fecha} formato="largo" />} />
        <Dato etiqueta="Método" valor={pago.metodoPago ?? "Sin especificar"} />
        {pago.referencia ? <Dato etiqueta="Referencia" valor={pago.referencia} /> : null}
        <Dato
          etiqueta="Monto"
          valor={<Currency value={pago.monto} tono="abono" />}
          destacado
          className="border-abono"
        />
      </div>

      {pago.notas ? (
        <Dato etiqueta="Notas" valor={pago.notas} className="mt-3" />
      ) : null}

      <RegistroAuditoria {...pago.registro} />
    </div>
  );
}
