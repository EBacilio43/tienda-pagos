import { Badge } from "@/components/ui/badge";
import { Currency } from "@/components/currency";
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
import { listarCatalogo } from "@/server/services/catalogo";
import { leerSesion } from "@/server/auth/session";
import { puedeGestionarCatalogo } from "@/lib/permisos";
import { CatalogoGrid } from "@/components/catalogo-grid";
import { CrearArticuloForm } from "@/components/crear-articulo-form";
import type { Rol } from "@/types/dominio";

export default async function CatalogoPage() {
  const items = await listarCatalogo();
  const usuario = await leerSesion();
  const esAdmin = usuario ? puedeGestionarCatalogo(usuario.rol as Rol) : false;

  return (
    <div>
      <PageHeader titulo="Catálogo" volver={false} />

      {esAdmin ? (
        <>
          <CrearArticuloForm />
          <CatalogoGrid itemsIniciales={items} />
        </>
      ) : (
        <PanelTabla>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <FilaVacia colSpan={4}>Sin artículos en el catálogo</FilaVacia>
              ) : (
                items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-normal">{i.nombre}</TableCell>
                    <TableCell className="text-right">
                      <Currency value={i.precio} />
                    </TableCell>
                    <TableCell className="text-right">{i.stock}</TableCell>
                    <TableCell>
                      <Badge variant={i.activo ? "secondary" : "outline"}>
                        {i.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </PanelTabla>
      )}
    </div>
  );
}
