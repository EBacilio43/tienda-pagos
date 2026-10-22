import { Currency } from "@/components/currency";
import type { ArticuloMovimiento } from "@/types/dominio";

// El desglose de piezas de un movimiento, para las celdas "Artículos" de las
// tablas de venta y devolución del detalle de cliente. Antes esas celdas
// recibían un string ya pegado ("2x Anillo, 1x Collar"): se veía QUÉ se
// vendió pero nunca a cuánto la pieza, que es justo lo que hay que poder
// contestarle a un cliente que pregunta de dónde sale su saldo.
//
// Un precio en null no se pinta como $0.00: la columna es nullable desde el
// esquema legacy y hay ventas capturadas sin desglosar precio. Cero sería
// decir que se regaló.
export function DesgloseArticulos({ articulos }: { articulos: ArticuloMovimiento[] }) {
  if (articulos.length === 0) {
    return <span className="text-muted-foreground">Sin desglose</span>;
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {articulos.map((a, i) => (
        <li key={i}>
          {a.cantidad}x {a.nombre}
          {a.precioUnitario && a.subtotal ? (
            <span className="text-muted-foreground">
              {" · "}
              <Currency value={a.precioUnitario} tono="neutro" /> c/u ={" "}
              <Currency value={a.subtotal} tono="neutro" />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
