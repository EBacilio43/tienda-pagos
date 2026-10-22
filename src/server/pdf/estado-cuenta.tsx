import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ClienteEstadoCuentaDTO, MovimientoLedger } from "@/server/services/estado-cuenta";
import { formatearMoneda } from "@/lib/money";
import { COLOR } from "@/server/pdf/paleta";
import { fechaHoraAString } from "@/lib/fecha";

// Fase 9 / ADR-17: la marca (azul grisáceo, croma bajo) y los cinco colores
// de movimiento (dato, croma alto) del PDF y de la app son EL MISMO origen
// — src/app/globals.css (:root) — no dos paletas que alguien tiene que
// mantener sincronizadas a mano. Ver src/server/pdf/paleta.ts.

const PAGE_PADDING = 36;
const HEADER_BAR_HEIGHT = 20;

// Fecha | Tipo | Descripción | Detalle | Cargo | Abono | Saldo
const COLS = [12, 11, 28, 20, 9.66, 9.66, 9.68] as const;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: COLOR.ink,
    paddingTop: PAGE_PADDING,
    paddingBottom: PAGE_PADDING + 12,
    paddingHorizontal: PAGE_PADDING,
  },
  // --- header de la tabla de movimientos, en el flujo y pegado a ella ---
  //
  // Antes estaba `position: absolute` en el tope de la página y con `fixed`,
  // más el paddingTop de `page` reservándole el hueco. Eso lo dejaba, en la
  // primera página, ARRIBA del título del documento: lo primero que se leía
  // en un estado de cuenta era "FECHA TIPO DESCRIPCIÓN…" flotando sobre los
  // datos del cliente, rotulando columnas que aún no existían.
  //
  // El `fixed` se quitó porque en el flujo no hace lo que parece. En
  // @react-pdf/layout, `splitNodes` empuja el nodo fixed a la página
  // siguiente **con su caja original**, sin volver a fluirlo — por eso
  // repetía bien mientras era absoluto, y por eso no hay forma de repetir
  // un encabezado en flujo. Consecuencia aceptada: en un estado de cuenta
  // de varias páginas los rótulos salen solo en la primera. Repetirlos
  // exigiría volver a una barra absoluta, que es justo lo que se quitó.
  tableHeader: {
    height: HEADER_BAR_HEIGHT,
    flexDirection: "row",
    backgroundColor: COLOR.navy900,
    alignItems: "center",
  },
  tableHeaderCell: {
    color: COLOR.white,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    paddingHorizontal: 6,
  },
  // --- footer, fixed: pie legal + paginación ---
  fixedFooter: {
    position: "absolute",
    bottom: 16,
    left: PAGE_PADDING,
    right: PAGE_PADDING,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
    paddingTop: 6,
    fontSize: 7,
    color: COLOR.inkSoft,
  },
  docHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COLOR.navy900,
    paddingBottom: 12,
  },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: COLOR.navy900 },
  docSubtitle: { fontSize: 8, color: COLOR.inkSoft, marginTop: 2 },
  docMeta: { fontSize: 7.5, color: COLOR.inkSoft, textAlign: "right", lineHeight: 1.6 },
  docMetaStrong: { fontFamily: "Helvetica-Bold", color: COLOR.ink },
  infoPanel: {
    flexDirection: "row",
    backgroundColor: COLOR.paperMuted,
    borderWidth: 1,
    borderColor: COLOR.line,
    borderRadius: 3,
    padding: 10,
    marginTop: 12,
  },
  infoCol: { flex: 1 },
  infoHeading: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLOR.navy700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  infoRow: { flexDirection: "row", marginBottom: 2, fontSize: 8 },
  infoLabel: { color: COLOR.inkSoft, width: 50 },
  infoValue: { fontFamily: "Helvetica-Bold" },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 6,
  },
  sectionBar: { width: 2.5, height: 10, backgroundColor: COLOR.navy700, marginRight: 6 },
  sectionText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: COLOR.navy900 },
  grupo: { borderBottomWidth: 1, borderBottomColor: COLOR.line },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
  },
  rowAlt: { backgroundColor: COLOR.paperMuted },
  // --- desglose por pieza, debajo de su movimiento ---
  //
  // Sin borde inferior y en cuerpo menor: los renglones de las piezas
  // pertenecen a la fila de arriba, no son movimientos por su cuenta. El
  // subtotal cae bajo la MISMA columna que el total que compone (Cargo en
  // una venta, Abono en una devolución), porque un número bajo el
  // encabezado equivocado dice algo que no es.
  detalleRow: { flexDirection: "row", paddingBottom: 3 },
  detalleCell: { paddingHorizontal: 6, fontSize: 7, color: COLOR.inkSoft },
  detalleNombre: { paddingLeft: 14 },
  detalleNum: { textAlign: "right" },
  cell: { paddingHorizontal: 6, fontSize: 8 },
  cellNum: { textAlign: "right", fontFamily: "Helvetica-Bold" },
  cellSoft: { color: COLOR.inkSoft },
  pill: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  emptyState: { fontSize: 9, color: COLOR.inkSoft, marginTop: 8 },
  summaryWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  summary: { width: 210, borderWidth: 1, borderColor: COLOR.line, borderRadius: 3, overflow: "hidden" },
  summaryHead: {
    backgroundColor: COLOR.navy900,
    color: COLOR.white,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    padding: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.line,
    fontSize: 8,
  },
  summaryFinal: {
    backgroundColor: COLOR.paperMuted,
    borderBottomWidth: 0,
    fontSize: 9.5,
    paddingVertical: 7,
  },
  summaryFinalLabel: { fontFamily: "Helvetica-Bold", color: COLOR.navy900 },
  summaryFinalAmt: { fontFamily: "Helvetica-Bold", color: COLOR.saldo },
});

const TIPO_ETIQUETA: Record<MovimientoLedger["tipo"], string> = {
  venta: "Venta",
  enganche: "Enganche",
  pago: "Abono",
  devolucion: "Devolución",
};

const TIPO_COLOR: Record<MovimientoLedger["tipo"], string> = {
  venta: COLOR.venta,
  enganche: COLOR.enganche,
  pago: COLOR.abono,
  devolucion: COLOR.devolucion,
};

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

function EncabezadoTabla() {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderCell, { width: `${COLS[0]}%` }]}>Fecha</Text>
      <Text style={[styles.tableHeaderCell, { width: `${COLS[1]}%` }]}>Tipo</Text>
      <Text style={[styles.tableHeaderCell, { width: `${COLS[2]}%` }]}>Descripción</Text>
      <Text style={[styles.tableHeaderCell, { width: `${COLS[3]}%` }]}>Detalle</Text>
      <Text style={[styles.tableHeaderCell, { width: `${COLS[4]}%`, textAlign: "right" }]}>
        Cargo
      </Text>
      <Text style={[styles.tableHeaderCell, { width: `${COLS[5]}%`, textAlign: "right" }]}>
        Abono
      </Text>
      <Text style={[styles.tableHeaderCell, { width: `${COLS[6]}%`, textAlign: "right" }]}>
        Saldo
      </Text>
    </View>
  );
}

function FixedFooter({ nombre }: { nombre: string }) {
  return (
    <View style={styles.fixedFooter} fixed>
      <Text>Documento informativo. No constituye factura ni comprobante fiscal. · {nombre}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function ClientePage({ cliente, generadoEn }: { cliente: ClienteEstadoCuentaDTO; generadoEn: Date }) {
  // Con toISOString() esto salía en UTC: un estado de cuenta generado a las
  // 19:00 en México decía el día SIGUIENTE y una hora seis horas adelantada,
  // impreso en un documento que se le entrega al cliente. El contenedor corre
  // en UTC y no fija TZ a propósito, así que la zona va explícita.
  const generado = fechaHoraAString(generadoEn);

  return (
    <Page size="LETTER" style={styles.page} wrap>
      <FixedFooter nombre={cliente.nombre} />

      <View style={styles.docHeader}>
        <View>
          <Text style={styles.docTitle}>Estado de Cuenta</Text>
          <Text style={styles.docSubtitle}>Reporte detallado de movimientos</Text>
        </View>
        <View style={styles.docMeta}>
          <Text>
            <Text style={styles.docMetaStrong}>Generado: </Text>
            {generado}
          </Text>
          <Text>Período: todos los movimientos</Text>
          <Text>Total operaciones: {cliente.movimientos.length}</Text>
        </View>
      </View>

      <View style={styles.infoPanel}>
        <View style={styles.infoCol}>
          <Text style={styles.infoHeading}>Datos del cliente</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nombre:</Text>
            <Text style={styles.infoValue}>{cliente.nombre}</Text>
          </View>
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.infoHeading}>Contacto &amp; registro</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text>{cliente.email ?? "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Teléfono:</Text>
            <Text>{cliente.telefono ?? "—"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Registro:</Text>
            <Text>{cliente.fechaRegistro ? fechaCorta(cliente.fechaRegistro) : "—"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionLabel}>
        <View style={styles.sectionBar} />
        <Text style={styles.sectionText}>Movimientos Cronológicos</Text>
      </View>

      {cliente.movimientos.length === 0 ? (
        <Text style={styles.emptyState}>Sin movimientos registrados.</Text>
      ) : null}

      {/* El rótulo de columnas solo tiene sentido si hay columnas que
          rotular: un cliente sin movimientos ya no recibe una barra navy
          encabezando la nada. */}
      {cliente.movimientos.length > 0 ? <EncabezadoTabla /> : null}

      {cliente.movimientos.map((m, i) => (
        <View
          key={m.id}
          style={[styles.grupo, ...(i % 2 === 1 ? [styles.rowAlt] : [])]}
          wrap={false}
        >
          <View style={styles.row}>
            <Text style={[styles.cell, { width: `${COLS[0]}%` }]}>{fechaCorta(m.fecha)}</Text>
            <View style={[styles.cell, { width: `${COLS[1]}%` }]}>
              <Text style={[styles.pill, { color: TIPO_COLOR[m.tipo], borderColor: TIPO_COLOR[m.tipo] }]}>
                {TIPO_ETIQUETA[m.tipo]}
              </Text>
            </View>
            <Text style={[styles.cell, { width: `${COLS[2]}%` }]}>{m.descripcion || "—"}</Text>
            <Text style={[styles.cell, styles.cellSoft, { width: `${COLS[3]}%` }]}>
              {m.detalle || "—"}
            </Text>
            <Text style={[styles.cell, styles.cellNum, { width: `${COLS[4]}%`, color: COLOR.saldo }]}>
              {m.cargo ? formatearMoneda(m.cargo) : "—"}
            </Text>
            <Text style={[styles.cell, styles.cellNum, { width: `${COLS[5]}%`, color: COLOR.abono }]}>
              {m.abono ? formatearMoneda(m.abono) : "—"}
            </Text>
            <Text style={[styles.cell, styles.cellNum, { width: `${COLS[6]}%`, color: COLOR.navy900 }]}>
              {formatearMoneda(m.saldoAcumulado)}
            </Text>
          </View>

          {/* Desglose pieza por pieza. El subtotal cae bajo la misma columna
              que el total al que suma — Cargo en una venta, Abono en una
              devolución— para que ningún número quede bajo un encabezado que
              no le corresponde. */}
          {m.articulos.map((a, j) => (
            <View key={j} style={styles.detalleRow}>
              <Text
                style={[
                  styles.detalleCell,
                  styles.detalleNombre,
                  { width: `${COLS[0] + COLS[1] + COLS[2] + COLS[3]}%` },
                ]}
              >
                {a.cantidad}x {a.nombre}
                {a.precioUnitario ? ` · ${formatearMoneda(a.precioUnitario)} c/u` : ""}
              </Text>
              <Text style={[styles.detalleCell, styles.detalleNum, { width: `${COLS[4]}%` }]}>
                {m.cargo && a.subtotal ? formatearMoneda(a.subtotal) : ""}
              </Text>
              <Text style={[styles.detalleCell, styles.detalleNum, { width: `${COLS[5]}%` }]}>
                {m.abono && a.subtotal ? formatearMoneda(a.subtotal) : ""}
              </Text>
              <Text style={{ width: `${COLS[6]}%` }} />
            </View>
          ))}
        </View>
      ))}

      <View style={styles.summaryWrap} wrap={false}>
        <View style={styles.summary}>
          <Text style={styles.summaryHead}>Resumen Financiero</Text>
          <View style={styles.summaryRow}>
            <Text>Total Ventas</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {formatearMoneda(cliente.resumen.totalVentas)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Enganches / Anticipos</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", color: COLOR.enganche }}>
              −{formatearMoneda(cliente.resumen.totalEnganches)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Total Devoluciones</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", color: COLOR.devolucion }}>
              −{formatearMoneda(cliente.resumen.totalDevoluciones)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Total Abonado</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", color: COLOR.abono }}>
              −{formatearMoneda(cliente.resumen.totalPagos)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryFinal]}>
            <Text style={styles.summaryFinalLabel}>Saldo Pendiente</Text>
            <Text style={styles.summaryFinalAmt}>{formatearMoneda(cliente.resumen.saldo)}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

export function EstadoCuentaDocument({
  clientes,
  generadoEn = new Date(),
}: {
  clientes: ClienteEstadoCuentaDTO[];
  generadoEn?: Date;
}) {
  return (
    <Document title="Estado de Cuenta" language="es">
      {clientes.map((cliente) => (
        <ClientePage key={cliente.id} cliente={cliente} generadoEn={generadoEn} />
      ))}
    </Document>
  );
}
