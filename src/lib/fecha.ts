// AGENTS.md regla 2: columnas DATE cruzan la frontera RSC como string
// YYYY-MM-DD, nunca como Date. Prisma las mapea a medianoche UTC — leer con
// getUTC* siempre, nunca toLocaleDateString directo (día anterior en MX).

// La zona del negocio. Vive aquí y no repartida por el código porque es el
// mismo dato para las tres cosas que la necesitan: el "hoy" del servidor,
// el sello de generación del PDF y los timestamps de auditoría.
const ZONA_NEGOCIO = "America/Mexico_City";

export function fechaAString(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

// "Hoy" según el calendario de quien está capturando, NO según UTC — y por
// eso solo se puede llamar desde el navegador (el nombre lo dice para que
// usarlo en el servidor se vea mal: ahí daría la hora del contenedor, que
// corre en UTC).
//
// El resto de este archivo usa getUTC* porque LEE columnas DATE que Prisma
// mapea a medianoche UTC. Esto es lo contrario: ESCRIBE la fecha que la
// persona quiere decir. `new Date().toISOString().slice(0,10)` —el atajo
// habitual— da la fecha UTC, así que en México (UTC−6) a partir de las
// 18:00 locales ya propone el día SIGUIENTE. Para una captura que suele
// hacerse en la noche, eso es fechar mal los abonos de forma sistemática.
//
// Ojo al usarla en un Client Component: se evalúa TAMBIÉN en el render del
// servidor (SSR), donde daría la fecha del contenedor. Para un input no
// controlado eso NO se corrige solo al hidratar, así que el valor hay que
// fijarlo después de montar — ver `components/campo-fecha.tsx`, que es lo
// que deben usar los formularios en vez de llamar a esto directamente.
export function hoyEnElNavegador(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

// El equivalente de `hoyEnElNavegador()` para el servidor, que corre en UTC
// (el contenedor no fija TZ, y no debe: cambiarlo movería también lo que
// Postgres y los logs interpretan). Lo usan el nombre del archivo del PDF y
// el validador de libretas, que necesitan el día del negocio y no tienen un
// navegador de dónde sacarlo. No sustituye a la regla 2: esto es "qué día es
// hoy", no "cómo se lee una columna DATE".
const formateadorDiaNegocio = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_NEGOCIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hoyEnZonaDelNegocio(referencia: Date = new Date()): string {
  // formatToParts y no una plantilla de locale ("en-CA" da YYYY-MM-DD por
  // casualidad): el orden de los campos de un locale no es un contrato.
  const partes = formateadorDiaNegocio.formatToParts(referencia);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)!.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function primerDiaDelMesUTC(referencia: Date = new Date()): Date {
  return new Date(
    Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1)
  );
}

export function primerDiaMesAnteriorUTC(referencia: Date = new Date()): Date {
  return new Date(
    Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() - 1, 1)
  );
}

// Límite inferior (inclusive) de una ventana de `dias` días terminando hoy,
// p. ej. haceNDiasUTC(6) = "los últimos 7 días incluyendo hoy".
export function haceNDiasUTC(dias: number, referencia: Date = new Date()): Date {
  return new Date(
    Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate() - dias)
  );
}

// Para timestamps reales (auditoria.timestamp, sesiones.*, usuarios.*) —
// a diferencia de fechaAString, estos sí tienen hora y no son medianoche
// UTC arbitraria, así que formatearlos con zona horaria explícita (no el
// default del sistema) es correcto, no el bug que regla 2 previene.
const formateadorFechaHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_NEGOCIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function fechaHoraAString(fecha: Date): string {
  return formateadorFechaHora.format(fecha);
}

// Misma zona y mismo formato que fechaHoraAString, con segundos. Existe
// solo para la auditoría: dos renglones de la misma transacción caen en el
// mismo minuto, y sin segundos el log deja de poder ordenarse a ojo (que es
// justo lo que se va a hacer con él cuando algo salió mal).
const formateadorFechaHoraSegundos = new Intl.DateTimeFormat("es-MX", {
  timeZone: ZONA_NEGOCIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function fechaHoraSegundosAString(fecha: Date): string {
  return formateadorFechaHoraSegundos.format(fecha);
}

// "hace 5 min", "hace 3 h", "hace 2 días". Se calcula en el SERVIDOR y
// cruza la frontera RSC ya resuelto a texto, así que envejece hasta el
// próximo render — aceptable en las pantallas donde se usa (usuarios,
// sistema), que son dinámicas y se piden de nuevo en cada visita.
//
// No usa Intl.RelativeTimeFormat: para "hace 90 minutos" hay que elegir la
// unidad igual (Intl formatea la unidad que se le dé, no la escoge), y el
// resultado en es-MX ("hace 2 horas") es más largo que el que cabe en una
// tarjeta. La elección de unidad es la lógica real, y vive aquí.
export function tiempoRelativo(fecha: Date, referencia: Date = new Date()): string {
  const segundos = Math.round((referencia.getTime() - fecha.getTime()) / 1000);

  // Un reloj adelantado en el cliente o una fila con timestamp futuro no
  // deben imprimir "hace -3 min".
  if (segundos < 0) return "en el futuro";
  if (segundos < 60) return "hace un momento";

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;

  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;

  const anios = Math.floor(dias / 365);
  return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
}
