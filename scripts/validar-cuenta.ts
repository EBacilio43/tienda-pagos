/**
 * Valida un JSON de cuenta transcrita de libreta ANTES de cargarlo.
 * Solo lectura: no escribe una sola fila.
 *
 * Hereda las validaciones que tenía `validar_migracion.py` en el repo
 * anterior, menos la de referencias huérfanas —que el formato anidado hace
 * imposible de expresar— y más la que aquel no podía hacer: comparar el
 * saldo escrito a mano en la libreta contra el que sale de los movimientos.
 *
 * Uso: npx tsx scripts/validar-cuenta.ts <archivo.json> [...más archivos]
 *      npx tsx scripts/validar-cuenta.ts --clientes   (lista ids y sale)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { esquemaCuentaLibreta, type CuentaLibreta } from "@/lib/schemas/libreta";
import { ventaDeApertura } from "@/server/services/libretas";
import { sumarMontos, multiplicarMonto, formatearMoneda, decimalAString } from "@/lib/money";
import { obtenerSaldo } from "@/server/services/saldo";
import { hoyEnZonaDelNegocio } from "@/lib/fecha";

const prisma = new PrismaClient();

/**
 * Saldo = saldo inicial + ventas − pagos − devoluciones, con enganche
 * contando como abono.
 *
 * El saldo inicial suma como una venta más porque eso es exactamente lo que
 * el cargador va a escribir: una venta de apertura (ver `ventaDeApertura` en
 * `server/services/libretas.ts`). Los dos lados tienen que dar lo mismo o la
 * comprobación contra `saldoDeclarado` no querría decir nada.
 */
function calcularSaldo(c: CuentaLibreta): {
  inicial: string;
  vendido: string;
  abonado: string;
  devuelto: string;
  saldo: string;
} {
  const inicial = c.saldoInicial ?? "0.00";
  const vendido = c.ventas.reduce((acc, v) => sumarMontos(acc, v.montoTotal), "0.00");
  const enganches = c.ventas.reduce((acc, v) => sumarMontos(acc, v.enganche), "0.00");
  const pagos = c.pagos.reduce((acc, p) => sumarMontos(acc, p.monto), "0.00");
  const devuelto = c.devoluciones.reduce((acc, d) => sumarMontos(acc, d.montoCredito), "0.00");

  const abonado = sumarMontos(enganches, pagos);
  const saldo = sumarMontos(inicial, vendido, `-${abonado}`, `-${devuelto}`);

  return { inicial, vendido, abonado, devuelto, saldo };
}

async function validarArchivo(ruta: string): Promise<boolean> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(ruta);
  console.log("=".repeat(70));

  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (e) {
    console.log(`  ERROR  No es JSON válido: ${(e as Error).message}`);
    return false;
  }

  const parseado = esquemaCuentaLibreta.safeParse(crudo);
  if (!parseado.success) {
    console.log("  ERROR  El JSON no cumple el contrato:");
    for (const issue of parseado.error.issues) {
      console.log(`         · ${issue.path.join(".") || "(raíz)"}: ${issue.message}`);
    }
    return false;
  }
  const cuenta = parseado.data;

  const errores: string[] = [];
  const avisos: string[] = [];

  // Lo que el cliente ya debe hoy, cuando el archivo se agrega a una cuenta
  // que ya existe. Sin esto, `saldoDeclarado` —que es el de la libreta
  // COMPLETA— se compararía contra el saldo de un archivo que solo trae los
  // renglones nuevos, y la única comprobación real del pipeline daría un
  // error falso justo en el caso donde más se necesita.
  let saldoYaEnLaBase = "0.00";

  // ── Cliente: nuevo o existente ───────────────────────────────────────
  if (cuenta.cliente.id !== null) {
    const existente = await prisma.cliente.findUnique({
      where: { id: cuenta.cliente.id },
      select: { id: true, nombre: true },
    });
    if (!existente) {
      errores.push(`No existe un cliente con id ${cuenta.cliente.id}`);
    } else {
      saldoYaEnLaBase = decimalAString(await obtenerSaldo(existente.id));
      console.log(`  Cliente: #${existente.id} ${existente.nombre} (se agrega a su cuenta)`);
      if (existente.nombre.trim().toLowerCase() !== cuenta.cliente.nombre.trim().toLowerCase()) {
        avisos.push(
          `El nombre del JSON ("${cuenta.cliente.nombre}") no coincide con el de la ` +
            `base ("${existente.nombre}"). Confirma que es la misma persona.`
        );
      }
    }
  } else {
    // El UNIQUE de clientes.nombre haría fallar la carga; mejor decirlo aquí.
    const choque = await prisma.cliente.findFirst({
      where: { nombre: cuenta.cliente.nombre },
      select: { id: true, nombre: true },
    });
    if (choque) {
      errores.push(
        `Ya existe un cliente llamado "${choque.nombre}" (id ${choque.id}) y ` +
          `clientes.nombre es UNIQUE. Si es la misma persona, pon "id": ${choque.id} ` +
          `en el JSON. Si es otra, cámbiale el nombre.`
      );
    } else {
      console.log(`  Cliente: NUEVO — "${cuenta.cliente.nombre}"`);
    }
  }

  // ── Cada venta: la suma de artículos contra el total ─────────────────
  cuenta.ventas.forEach((v, i) => {
    if (v.articulos.length === 0) return;
    const sinPrecio = v.articulos.filter((a) => a.precioUnitario === null).length;
    if (sinPrecio > 0) {
      avisos.push(`Venta ${i + 1} (${v.fecha}): ${sinPrecio} artículo(s) sin precio, no se puede cuadrar`);
      return;
    }
    const suma = v.articulos.reduce(
      (acc, a) => sumarMontos(acc, multiplicarMonto(a.precioUnitario as string, a.cantidad)),
      "0.00"
    );
    if (suma !== v.montoTotal) {
      avisos.push(
        `Venta ${i + 1} (${v.fecha}): los artículos suman ${formatearMoneda(suma)} ` +
          `pero el total dice ${formatearMoneda(v.montoTotal)}`
      );
    }
    if (v.tieneEnganche && v.enganche === "0.00") {
      avisos.push(`Venta ${i + 1} (${v.fecha}): dice tener enganche pero es 0.00`);
    }
  });

  // ── Fechas en el futuro ──────────────────────────────────────────────
  // El día del negocio, no el de UTC: entre las 18:00 y la medianoche en
  // México, UTC ya es mañana y una fecha capturada como mañana pasaría.
  const hoy = hoyEnZonaDelNegocio();
  const futuras = [
    ...cuenta.ventas.map((v) => ["venta", v.fecha] as const),
    ...cuenta.pagos.map((p) => ["pago", p.fecha] as const),
    ...cuenta.devoluciones.map((d) => ["devolución", d.fecha] as const),
  ].filter(([, f]) => f > hoy);
  for (const [tipo, f] of futuras) {
    errores.push(`Hay una ${tipo} con fecha en el futuro: ${f}`);
  }

  // ── Saldo ────────────────────────────────────────────────────────────
  const s = calcularSaldo(cuenta);
  console.log("");
  if (cuenta.saldoInicial !== null && Number(cuenta.saldoInicial) !== 0) {
    // Se anuncia aparte porque no está en ningún renglón de la libreta: es
    // deuda heredada, y quien valide tiene que verla para reconocerla.
    try {
      const ap = ventaDeApertura(cuenta);
      console.log(
        `  Saldo inicial ${formatearMoneda(s.inicial).padStart(11)}   ` +
          `(entra como venta de apertura del ${ap?.fecha})`
      );
    } catch (e) {
      errores.push((e as Error).message);
    }
  }
  console.log(`  Vendido    ${formatearMoneda(s.vendido).padStart(14)}   (${cuenta.ventas.length} venta/s)`);
  console.log(`  Abonado    ${formatearMoneda(s.abonado).padStart(14)}   (${cuenta.pagos.length} abono/s + enganches)`);
  console.log(`  Devuelto   ${formatearMoneda(s.devuelto).padStart(14)}   (${cuenta.devoluciones.length})`);
  console.log(`  ${"-".repeat(30)}`);
  if (saldoYaEnLaBase !== "0.00") {
    console.log(`  Del archivo${formatearMoneda(s.saldo).padStart(14)}`);
    console.log(`  Ya en la base${formatearMoneda(saldoYaEnLaBase).padStart(12)}`);
  }
  const saldoFinal = sumarMontos(s.saldo, saldoYaEnLaBase);
  console.log(`  SALDO      ${formatearMoneda(saldoFinal).padStart(14)}`);

  // La comprobación que ningún script anterior podía hacer: contra lo que
  // la propia libreta dice. Es el único control real sobre el OCR.
  if (cuenta.saldoDeclarado !== null) {
    if (cuenta.saldoDeclarado === saldoFinal) {
      console.log(`  Coincide con el saldo escrito en la libreta.`);
    } else {
      errores.push(
        `El saldo calculado (${formatearMoneda(saldoFinal)}) NO coincide con el ` +
          `escrito en la libreta (${formatearMoneda(cuenta.saldoDeclarado)}). ` +
          `Diferencia: ${formatearMoneda(sumarMontos(saldoFinal, `-${cuenta.saldoDeclarado}`))}. ` +
          `Hay un renglón mal transcrito, o falta uno.`
      );
    }
  } else {
    avisos.push("La libreta no traía saldo escrito, así que nada verifica el OCR de esta cuenta");
  }

  // ── Lo que el OCR marcó como dudoso ──────────────────────────────────
  if (cuenta.notasDeTranscripcion.length > 0) {
    console.log(`\n  El OCR dejó ${cuenta.notasDeTranscripcion.length} nota(s):`);
    cuenta.notasDeTranscripcion.forEach((n) => console.log(`         · ${n}`));
  }

  if (avisos.length > 0) {
    console.log(`\n  AVISOS (revisar, no bloquean):`);
    avisos.forEach((a) => console.log(`         · ${a}`));
  }
  if (errores.length > 0) {
    console.log(`\n  ERRORES (bloquean la carga):`);
    errores.forEach((e) => console.log(`         · ${e}`));
    return false;
  }

  console.log(`\n  Listo para cargar.`);
  return true;
}

async function listarClientes() {
  const clientes = await prisma.cliente.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  console.log(`\n${clientes.length} cliente(s) en la base:\n`);
  for (const c of clientes) {
    console.log(`  "id": ${String(c.id).padEnd(4)}  ${c.nombre}`);
  }
  console.log(
    `\nPara agregar movimientos a una cuenta existente, copia su id al campo\n` +
      `"cliente.id" del JSON. Para un cliente nuevo, déjalo en null.\n`
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--clientes")) {
    await listarClientes();
    return;
  }
  if (args.length === 0) {
    console.error("Uso: npx tsx scripts/validar-cuenta.ts <archivo.json> [...]");
    console.error("     npx tsx scripts/validar-cuenta.ts --clientes");
    process.exitCode = 1;
    return;
  }

  let fallaron = 0;
  for (const ruta of args) {
    const ok = await validarArchivo(ruta);
    if (!ok) fallaron++;
  }

  console.log(`\n${"=".repeat(70)}`);
  if (fallaron > 0) {
    console.log(`${fallaron} de ${args.length} archivo(s) con errores. No cargues esos.`);
    process.exitCode = 1;
  } else {
    console.log(`${args.length} archivo(s) listos para cargar.`);
  }
}

main()
  .catch((err) => {
    console.error("Error corriendo validar-cuenta:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
