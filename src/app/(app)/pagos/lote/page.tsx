import { requireRole } from "@/server/auth/guards";
import { listarClientesParaSelector } from "@/server/services/clientes";
import { obtenerTodosLosSaldos } from "@/server/services/saldo";
import { decimalAString } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { CapturaAbonos, type ClienteCaptura } from "@/components/captura-abonos";

// Captura de abonos en lote. Existe porque el cobro real ocurre en la calle
// a lo largo de varios días y se captura todo junto después — un formulario
// por abono obliga a navegar al cliente, llenar, enviar y volver, por cada
// uno. `?clienteId=` (repetible) precarga renglones: es el atajo desde la
// selección de /clientes.
export default async function CapturaAbonosPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string | string[] }>;
}) {
  await requireRole("operador", "admin");

  const { clienteId } = await searchParams;
  const crudos = clienteId === undefined ? [] : Array.isArray(clienteId) ? clienteId : [clienteId];
  const preseleccionados = crudos.map(Number).filter((n) => Number.isInteger(n) && n > 0);

  // Dos consultas fijas para toda la pantalla, sin importar cuántos
  // clientes haya: el saldo en vivo por renglón sale de aquí, no de una
  // consulta por cliente elegido.
  const [clientes, saldos] = await Promise.all([
    listarClientesParaSelector(),
    obtenerTodosLosSaldos(),
  ]);

  const conSaldo: ClienteCaptura[] = clientes.map((c) => {
    const saldo = saldos.get(c.id);
    // La vista v_saldos_cliente hace LEFT JOIN desde clientes, así que
    // todos aparecen — el "0.00" es por si acaso, no el caso normal.
    return { id: c.id, nombre: c.nombre, saldo: saldo ? decimalAString(saldo) : "0.00" };
  });

  return (
    <div>
      <PageHeader
        titulo="Registrar abonos"
        descripcion="Captura varios abonos de una sola vez, cada uno con su propia fecha"
      />
      <CapturaAbonos clientes={conSaldo} preseleccionados={preseleccionados} />
    </div>
  );
}
