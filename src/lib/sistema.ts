// Formato de las magnitudes que muestra /admin/sistema. Puro y sin
// dependencias: se prueba en tests/unit/ y lo importan tanto el servicio
// (que arma el snapshot) como el panel en el navegador (que reformatea al
// refrescar), sin cruzar la regla 6.

const UNIDADES = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Bytes en la unidad más grande que deje un número legible. Base 1024, que
 * es la que usan `free`, `docker stats` y el propio kernel en cgroup — no
 * la de 1000, para que el número coincida con el que se ve en la terminal
 * al diagnosticar el mismo contenedor.
 */
export function formatearBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < UNIDADES.length - 1) {
    valor /= 1024;
    i += 1;
  }
  // Un decimal a partir de MB; por debajo, los decimales son ruido.
  const decimales = i <= 1 ? 0 : 1;
  return `${valor.toFixed(decimales)} ${UNIDADES[i]}`;
}

/**
 * Segundos a "3 d 04 h", "4 h 12 min", "39 s". Se corta en dos unidades:
 * la tercera nunca cambia la decisión de nadie que esté mirando el uptime.
 */
export function formatearDuracion(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "—";

  const total = Math.floor(segundos);
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;

  if (dias > 0) return `${dias} d ${String(horas).padStart(2, "0")} h`;
  if (horas > 0) return `${horas} h ${String(minutos).padStart(2, "0")} min`;
  if (minutos > 0) return `${minutos} min ${String(resto).padStart(2, "0")} s`;
  return `${resto} s`;
}

/** Milisegundos con la precisión que corresponde a su magnitud. */
export function formatearMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Mediana, no promedio: una sola consulta lenta (un reintento de conexión,
 * una pausa de GC) arrastra el promedio de cinco muestras y hace ver mal un
 * sistema que está bien. Con el mínimo y el máximo al lado, la mediana es
 * la que describe el caso normal.
 */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
}

/**
 * El semáforo de una métrica. Tres estados y no más: "hay que ver esto
 * ahora", "hay que verlo pronto" y "está bien". Un cuarto nivel obliga a
 * decidir en qué cubeta cae cada cosa sin que la respuesta cambie nada.
 */
export type NivelSalud = "bien" | "aviso" | "critico";

export function nivelPorUmbral(
  valor: number | null,
  umbralAviso: number,
  umbralCritico: number
): NivelSalud {
  if (valor === null || !Number.isFinite(valor)) return "bien";
  if (valor >= umbralCritico) return "critico";
  if (valor >= umbralAviso) return "aviso";
  return "bien";
}
