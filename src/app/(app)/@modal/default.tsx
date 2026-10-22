// Slot @modal vacío: es lo que se renderiza cuando NINGUNA ruta
// interceptada está activa, que es la mayoría del tiempo. Sin este archivo,
// Next no sabe qué poner en el slot al recargar una ruta que no intercepta
// nada y devuelve 404.
export default function SinModal() {
  return null;
}
