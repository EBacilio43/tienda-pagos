import { z } from "zod";
import { REGEX_MONTO_POSITIVO } from "@/lib/money";
import { METODOS_PAGO } from "@/lib/schemas/pago";
import { sanitizarCadena } from "@/lib/sanitizacion";

/**
 * Contrato de una cuenta transcrita desde una libreta de papel.
 *
 * Reemplaza las cuatro plantillas de Excel del sistema anterior
 * (`scripts_migracion_libreta/generar_plantillas.py` en el repo viejo). Dos
 * diferencias que no son de formato sino de diseño:
 *
 * 1. **Los artículos van anidados en su venta.** Aquel formato necesitaba
 *    ids temporales (`V001`, `C001`) para enlazar hojas, porque Excel es
 *    plano. Al anidar, la referencia huérfana —uno de los cinco errores que
 *    validaba aquel script— deja de ser posible de expresar.
 * 2. **El dinero es string, nunca número** (regla 1).
 *
 * El origen es transcripción o digitalización de cuentas físicas.
 */

const MONTO = z
  .string()
  .trim()
  .regex(REGEX_MONTO_POSITIVO, "Monto inválido: se espera algo como \"2000.00\"");

// Se acepta "0.00" además de lo que exige REGEX_MONTO_POSITIVO, porque un
// enganche de cero es lo normal en una venta sin enganche. El tope de 9
// dígitos NO es cosmético: las columnas son Decimal(12,2), así que un valor
// más largo pasa la validación y revienta en el INSERT, a media transacción
// y con la mitad de la cuenta ya escrita.
const MONTO_O_CERO = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Monto inválido: se espera algo como \"0.00\"");

// El regex comprueba la FORMA, no que la fecha exista: "2024-13-45" lo pasa.
// Y el servicio construye `new Date(`${fecha}T00:00:00Z`)`, así que eso
// llegaría al INSERT como Invalid Date. Un OCR que lea mal un mes produce
// exactamente esto, de modo que se verifica que el round-trip por Date
// devuelva la misma cadena.
const FECHA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida: se espera AAAA-MM-DD")
  .refine(
    (f) => {
      // El guardia de NaN no es defensivo de más: zod v4 corre TODOS los
      // checks aunque el regex ya haya fallado, así que aquí llega cualquier
      // cadena. Y `toISOString()` sobre un Invalid Date lanza RangeError en
      // vez de devolver algo — un crash donde debería haber un mensaje.
      const d = new Date(`${f}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
    },
    { message: "Esa fecha no existe en el calendario" }
  );

const textoOpcional = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      if (!v) return null;
      const s = sanitizarCadena(v);
      return s.length > 0 ? s : null;
    });

const esquemaArticulo = z.object({
  nombre: z.string().trim().min(1, "El artículo necesita nombre").max(200),
  cantidad: z.number().int().positive().nullish().transform((v) => v ?? 1),
  precioUnitario: MONTO.nullish().transform((v) => v ?? null),
});

const esquemaVenta = z.object({
  fecha: FECHA,
  montoTotal: MONTO,
  tieneEnganche: z.boolean().nullish().transform((v) => v ?? false),
  enganche: MONTO_O_CERO.nullish().transform((v) => v ?? "0.00"),
  // Puede venir vacío a propósito: hay libretas que anotan el total de la
  // venta sin desglosar las piezas. Inventar artículos para cuadrar la suma
  // sería fabricar datos, así que el prompt pide explícitamente no hacerlo.
  articulos: z.array(esquemaArticulo).default([]),
});

const esquemaPagoLibreta = z.object({
  fecha: FECHA,
  monto: MONTO,
  metodoPago: z.enum(METODOS_PAGO).nullish().transform((v) => v ?? "Efectivo"),
  referencia: textoOpcional(200),
  notas: textoOpcional(2000),
});

const esquemaDevolucion = z.object({
  fecha: FECHA,
  motivo: textoOpcional(2000),
  montoCredito: MONTO_O_CERO,
  articulos: z.array(esquemaArticulo).default([]),
});

/**
 * `id` presente = la cuenta es de un cliente que YA existe y los movimientos
 * se agregan a la suya. `id` en null = cliente nuevo, se crea con estos
 * datos.
 *
 * El vínculo es por id y no por nombre a propósito: `clientes.nombre` tiene
 * UNIQUE desde la migración `00000000000004_integridad_dominio`, y enlazar
 * por nombre haría que un OCR que lea "Leticia Cerón" donde la base dice
 * "Leticia Ceron" creara un cliente duplicado en vez de fallar.
 */
const esquemaClienteLibreta = z.object({
  id: z.number().int().positive().nullish().transform((v) => v ?? null),
  nombre: z.string().trim().min(1, "El cliente necesita nombre").max(150),
  telefono: textoOpcional(20),
  email: textoOpcional(150),
  empresa: textoOpcional(150),
  calle: textoOpcional(200),
  numExt: textoOpcional(20),
  numInt: textoOpcional(20),
  colonia: textoOpcional(100),
  municipio: textoOpcional(100),
  estado: textoOpcional(100),
  cp: textoOpcional(10),
});

export const esquemaCuentaLibreta = z.object({
  cliente: esquemaClienteLibreta,
  ventas: z.array(esquemaVenta).default([]),
  pagos: z.array(esquemaPagoLibreta).default([]),
  devoluciones: z.array(esquemaDevolucion).default([]),

  /**
   * Lo que el cliente ya debía en el primer renglón de la hoja transcrita,
   * cuando la cuenta viene arrastrada de una libreta anterior que ya no se
   * tiene o cuyo inicio no se encuentra. No es un dato calculado: es la
   * "resta" con la que abre la hoja.
   *
   * Se carga como una **venta de apertura** y no como un campo del cliente,
   * porque en este modelo lo único que crea deuda es una venta —y así la
   * fórmula del saldo (regla 3, `v_saldos_cliente`) no se toca. Ver
   * `cargarCuentaDeLibreta`.
   */
  saldoInicial: MONTO_O_CERO.nullish().transform((v) => v ?? null),

  /**
   * El saldo escrito a mano en la libreta, transcrito tal cual y NO
   * calculado. Es el único control real sobre la exactitud del OCR: el
   * validador lo compara contra el saldo que sale de los movimientos, y una
   * cifra mal leída se delata ahí en vez de descubrirse el día que el
   * cliente reclama. Opcional porque no toda libreta lo trae.
   */
  saldoDeclarado: MONTO_O_CERO.nullish().transform((v) => v ?? null),

  /**
   * Lo que el OCR no pudo leer con certeza. Que exista es parte del diseño:
   * el prompt prefiere una cuenta incompleta y señalada sobre una completa e
   * inventada, porque la primera se arregla en un minuto y la segunda no se
   * detecta nunca.
   */
  notasDeTranscripcion: z.array(z.string()).default([]),
});

export type CuentaLibreta = z.infer<typeof esquemaCuentaLibreta>;
export type VentaLibreta = z.infer<typeof esquemaVenta>;
export type DevolucionLibreta = z.infer<typeof esquemaDevolucion>;
