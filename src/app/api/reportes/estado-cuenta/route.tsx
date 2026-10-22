import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { requireUser } from "@/server/auth/guards";
import { obtenerDatosEstadoCuenta } from "@/server/services/estado-cuenta";
import { EstadoCuentaDocument } from "@/server/pdf/estado-cuenta";
import { hoyEnZonaDelNegocio } from "@/lib/fecha";

// ADR-16: streaming directo al Response, nunca toca disco — el bug del
// legacy (logic.py:1155 escribe al CWD del servidor, gui.py hace
// os.startfile(); en Railway el usuario remoto nunca recibe el PDF).
export async function GET(request: NextRequest) {
  await requireUser(); // Leer/generar PDF: los 3 roles pueden (ADR-09).

  const clienteIds = request.nextUrl.searchParams
    .getAll("clienteId")
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);

  if (clienteIds.length === 0) {
    return NextResponse.json({ error: "Falta clienteId" }, { status: 400 });
  }

  const clientes = await obtenerDatosEstadoCuenta(clienteIds);
  if (clientes.length === 0) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // renderToStream tipa su retorno como el NodeJS.ReadableStream genérico,
  // pero en runtime (Node, no Edge) siempre es una instancia real de
  // stream.Readable — lo que Readable.toWeb() necesita.
  const stream = (await renderToStream(
    <EstadoCuentaDocument clientes={clientes} />
  )) as Readable;
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  const filename = construirNombreArchivo(clientes.map((c) => c.nombre));

  // `?vista=previa` cambia attachment por inline para poder mostrarlo en un
  // <iframe> sin disparar la descarga. Es el MISMO documento, no una
  // segunda versión en HTML: previsualizar algo distinto de lo que se va a
  // descargar no sirve de nada, y dos renderizados del mismo estado de
  // cuenta acabarían divergiendo (el mismo motivo por el que
  // scripts/verificar-paleta.ts existe). El nombre de archivo se conserva
  // en ambos modos: el visor del navegador lo usa si se guarda desde ahí.
  const enLinea = request.nextUrl.searchParams.get("vista") === "previa";

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename="${filename.ascii}"; filename*=UTF-8''${filename.utf8}`,
    },
  });
}

// El filename se sanea antes de ir al header — el legacy es inyectable ahí
// (docs/PLAN.md, tabla de defectos).
function construirNombreArchivo(nombres: string[]): { ascii: string; utf8: string } {
  const hoy = hoyEnZonaDelNegocio().replace(/-/g, "");
  const base =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.length}_clientes`;

  const limpio = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // quita acentos (marcas diacríticas combinantes)
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);

  const ascii = `Estado_Cuenta_${limpio || "cliente"}_${hoy}.pdf`;
  const utf8 = encodeURIComponent(`Estado_Cuenta_${base}_${hoy}.pdf`);

  return { ascii, utf8 };
}
