import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { PanelTabla } from "@/components/panel-tabla";
import { FilaVacia } from "@/components/estado-vacio";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { listarInventario } from "@/server/services/catalogo";

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const soloBajoMinimo = filtro === "bajo-minimo";

  const items = await listarInventario(soloBajoMinimo);

  return (
    <div>
      <PageHeader
        titulo={soloBajoMinimo ? "Inventario — bajo mínimo" : "Inventario"}
        volver={false}
      />

      <PanelTabla>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artículo</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Mínimo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <FilaVacia colSpan={4}>Sin artículos</FilaVacia>
            ) : (
              items.map((i) => {
                const bajoMinimo = i.stockMinimo > 0 && i.stock <= i.stockMinimo;
                return (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-normal">{i.nombre}</TableCell>
                    <TableCell className="text-right">{i.stock}</TableCell>
                    <TableCell className="text-right">{i.stockMinimo}</TableCell>
                    <TableCell>
                      {bajoMinimo ? (
                        <Badge variant="destructive">Bajo mínimo</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </PanelTabla>
    </div>
  );
}
