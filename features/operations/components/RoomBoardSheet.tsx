import { breakfastSheetFonts } from "@/features/operations/components/breakfast-sheet-fonts";
import { controlLongDateLabel, generatedLabel } from "@/features/operations/logic/breakfast-control";
import { STATUS_LABEL, shortDate, type BoardSheetSummary } from "@/features/operations/logic/board-sheet";

const dash = (values: string[]) => values.length ? values.join(" / ") : "—";

/**
 * The printable Room board. One markup for the screen preview, Imprimir, Descargar PDF and
 * Descargar PNG; always in Spanish. Pago and Saldo only appear with `includePayments`.
 */
export function RoomBoardSheet({ id, date, generatedAt, summary, includePayments }: { id?: string; date: string; generatedAt: Date; summary: BoardSheetSummary; includePayments: boolean }) {
  const columns = ["Hab.", "Huésped", "Pax", "Estado", ...(includePayments ? ["Pago", "Saldo"] : []), "Desayuno", "Placa", "Canal", "Salida", "Tours", "Notas"];
  return (
    <div id={id} className={`bk-sheet rb-sheet ${breakfastSheetFonts}`}>
      <section className="bk-card" aria-label="Tablero de operaciones">
        <header className="bk-head">
          <div><h2>Tablero de operaciones</h2><div className="bk-sub">Hotel Yuli · Uvita</div></div>
          <div className="bk-date">{controlLongDateLabel(date)}<span className="bk-gen">Generado {generatedLabel(generatedAt)}</span></div>
        </header>
        <div className="bk-scroll">
          <table className="bk-table rb-table">
            <thead><tr>{columns.map((column) => <th key={column} className={column === "Pax" ? "c" : undefined}>{column}</th>)}</tr></thead>
            <tbody>
              {summary.lines.map((line) => (
                <tr key={line.label} data-room={line.label} className={line.status === "available" ? "rb-free" : undefined}>
                  <td className="bk-room">{line.beds ? <>{line.label.replace(/ camas$/, "")} <span className="bk-camas">camas</span></> : line.label}</td>
                  <td className="bk-guest">{dash(line.names)}</td>
                  <td className="bk-pax c">{line.pax || "—"}</td>
                  <td>
                    <span className={`rb-status rb-status-${line.status}`}>{STATUS_LABEL[line.status]}</span>
                    {line.statusNotes.map((note) => <small key={note} className="rb-small">{note}</small>)}
                  </td>
                  {includePayments && <td data-col="pago">{dash(line.payments)}</td>}
                  {includePayments && <td data-col="saldo" className="rb-nowrap">{dash(line.balances)}</td>}
                  <td>
                    {line.breakfastIncluded ? <span className="bk-pill">{`☕ INCLUIDO (${line.breakfastPax})`}</span> : "—"}
                    {line.toGo && <span className="bk-togo">{`\u{1F961} ${line.toGoTime ?? "para llevar"}`}</span>}
                  </td>
                  <td className="rb-nowrap">{dash(line.plates)}</td>
                  <td>{dash(line.channels)}</td>
                  <td className="rb-nowrap">{dash(line.departures)}</td>
                  <td>{line.tours.length ? line.tours.map((tour) => <span key={tour.id} className="rb-tour">{tour.tourName}<small>{tour.tourDate === date ? "Hoy" : shortDate(tour.tourDate)}{tour.status === "paid" ? " · Pagado" : ""}</small></span>) : "—"}</td>
                  <td className="rb-notes">{dash(line.notes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bk-tot rb-tot">
          <div className="bk-tot-a"><small>Habitaciones ocupadas</small><strong data-testid="board-occupied">{summary.occupied}</strong><span data-testid="board-lines">de {summary.lines.length} · {summary.free} libres</span></div>
          <div className="rb-tot-mid"><small>Total huéspedes</small><strong data-testid="board-pax">{summary.pax}</strong><span>pax</span></div>
          <div className="bk-tot-b"><small>Desayunos incluidos</small><strong data-testid="board-breakfast">{summary.breakfastPax}</strong><span>pax</span></div>
        </div>
      </section>
      <footer className="bk-foot"><span>Hotel Yuli · YuliOS</span></footer>
    </div>
  );
}
