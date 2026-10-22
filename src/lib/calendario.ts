// Aritmética de la cuadrícula de mes de /actividad. Todo aquí es lógica
// pura y sin BD, por eso vive en lib/ y no en server/ — y todo usa métodos
// UTC (regla 2): las columnas `fecha` de ventas/pagos/devoluciones son DATE
// y Prisma las mapea a medianoche UTC, así que un `getDate()` local
// devolvería el día anterior en México y el movimiento caería en la celda
// equivocada. Ese es exactamente el bug que la regla 2 previene, y en un
// calendario sería invisible: la cifra se ve razonable, solo está un día
// corrida.

/** Un mes es "AAAA-MM"; un día, "AAAA-MM-DD". Nunca un objeto Date. */
export type Mes = string;
export type Dia = string;

export type CeldaCalendario = {
  /** "AAAA-MM-DD" — también para las celdas de relleno del mes vecino. */
  fecha: Dia;
  dia: number;
  /** false = relleno de la primera o la última semana (mes vecino). */
  delMes: boolean;
};

const REGEX_MES = /^\d{4}-\d{2}$/;
const REGEX_DIA = /^\d{4}-\d{2}-\d{2}$/;

// Lunes primero: es la semana del calendario mexicano, y también la del
// negocio — el corte de la semana no cae en domingo para nadie aquí.
export const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"] as const;

function fechaUTC(texto: string): Date | null {
  const d = new Date(`${texto}T00:00:00Z`);
  // Sin el guardia de NaN, `toISOString()` sobre un Invalid Date lanza
  // RangeError en vez de devolver algo — mismo tropiezo que documenta
  // `lib/schemas/libreta.ts`, y aquí la entrada viene de la URL, o sea de
  // cualquiera.
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Normaliza el `?mes=` de la URL. Devuelve null si no es un mes real —
 * "2026-13" pasa el regex y no existe, y la URL la escribe quien quiera.
 */
export function parsearMes(texto: string | undefined): Mes | null {
  if (!texto || !REGEX_MES.test(texto)) return null;
  const d = fechaUTC(`${texto}-01`);
  if (!d || d.toISOString().slice(0, 7) !== texto) return null;
  return texto;
}

/**
 * Normaliza el `?dia=` de la URL. El round-trip por Date es lo que rechaza
 * "2026-02-30", que el regex acepta.
 */
export function parsearDia(texto: string | undefined): Dia | null {
  if (!texto || !REGEX_DIA.test(texto)) return null;
  const d = fechaUTC(texto);
  if (!d || d.toISOString().slice(0, 10) !== texto) return null;
  return texto;
}

export function mesDelDia(dia: Dia): Mes {
  return dia.slice(0, 7);
}

function desplazarMes(mes: Mes, delta: number): Mes {
  const anio = Number(mes.slice(0, 4));
  const numeroMes = Number(mes.slice(5, 7));
  // Date.UTC normaliza solo el desbordamiento: mes 0 → diciembre anterior,
  // mes 13 → enero siguiente. No hay que tratar el cambio de año a mano.
  const d = new Date(Date.UTC(anio, numeroMes - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function mesAnterior(mes: Mes): Mes {
  return desplazarMes(mes, -1);
}

export function mesSiguiente(mes: Mes): Mes {
  return desplazarMes(mes, 1);
}

const formateadorMes = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** "septiembre 2026" — para el encabezado de la cuadrícula. */
export function etiquetaMes(mes: Mes): string {
  // timeZone UTC a propósito: el Date es medianoche UTC del día 1, y
  // formatearlo en la zona del negocio (UTC−6) lo correría al mes anterior
  // cada primero de mes.
  //
  // Y se arma por partes, no recortando el separador del formato completo:
  // es-MX rinde "septiembre de 2026", así que quitar una coma —que es lo
  // que uno supone— no quita nada. El separador de un locale no es un
  // contrato, mismo criterio que `hoyEnZonaDelNegocio` en lib/fecha.ts.
  const partes = formateadorMes.formatToParts(new Date(`${mes}-01T00:00:00Z`));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)!.value;
  return `${valor("month")} ${valor("year")}`;
}

const formateadorDiaLargo = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "sábado, 5 de septiembre de 2026" — para el encabezado del día elegido. */
export function etiquetaDiaLargo(dia: Dia): string {
  return formateadorDiaLargo.format(new Date(`${dia}T00:00:00Z`));
}

/**
 * Las celdas de la cuadrícula, siempre en semanas completas de lunes a
 * domingo: los huecos de la primera y la última semana se rellenan con los
 * días del mes vecino en vez de dejarse vacíos, para que la retícula no
 * cambie de forma y para que un movimiento del 31 de agosto siga siendo
 * visible al abrir septiembre.
 */
export function celdasDelMes(mes: Mes): CeldaCalendario[] {
  const anio = Number(mes.slice(0, 4));
  const numeroMes = Number(mes.slice(5, 7));

  const primero = new Date(Date.UTC(anio, numeroMes - 1, 1));
  // getUTCDay() da 0 para domingo; con la semana empezando en lunes, el
  // desplazamiento del primer día es (día + 6) % 7 — así el lunes queda en 0
  // y el domingo en 6.
  const desplazamiento = (primero.getUTCDay() + 6) % 7;

  const diasDelMes = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  const total = Math.ceil((desplazamiento + diasDelMes) / 7) * 7;

  const celdas: CeldaCalendario[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(anio, numeroMes - 1, 1 - desplazamiento + i));
    const fecha = d.toISOString().slice(0, 10);
    celdas.push({
      fecha,
      dia: d.getUTCDate(),
      delMes: fecha.slice(0, 7) === mes,
    });
  }
  return celdas;
}
