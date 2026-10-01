import { controlDateLabel, freeLabel, type ControlSummary } from "@/features/operations/logic/breakfast-control";
import type { Locale } from "@/lib/i18n";

/** On-screen card for the Control de desayunos; renders the same summary as the text. */
export function BreakfastControlCard({ date, summary, locale }: { date: string; summary: ControlSummary; locale: Locale }) {
  const es = locale === "es";
  return (
    <section id="breakfast-control-card" className="breakfast-control-card" aria-label={es ? "Control de desayunos" : "Breakfast control"}>
      <header className="breakfast-control-head">
        <h2>{es ? "Desayuno del" : "Breakfast on"} {controlDateLabel(date)}</h2>
        <p data-testid="control-free"><strong>{es ? "Libres" : "Free"}:</strong> {freeLabel(summary.free)}</p>
      </header>
      <div className="board-table-scroll"><table className="board-table">
        <thead><tr><th>{es ? "Hab." : "Room"}</th><th>{es ? "Huéspedes" : "Guests"}</th><th>Pax</th><th>{es ? "Desayuno" : "Breakfast"}</th><th>{es ? "Para llevar" : "To go"}</th><th>{es ? "Notas" : "Notes"}</th></tr></thead>
        <tbody>
          {summary.lines.length ? summary.lines.map((line, index) => (
            <tr key={`${line.label}-${index}`} data-room={line.label}>
              <td><strong>{line.label}</strong></td>
              <td>{line.names.length ? line.names.join(" / ") : "—"}</td>
              <td>{line.pax}</td>
              <td>{line.included ? <span className="state-pill state-completed">✅ {es ? "Incluido" : "Included"}{line.breakfastPax !== line.pax ? ` · ${line.breakfastPax} pax` : ""}</span> : "—"}</td>
              <td>{line.toGo ? `🥡 ${line.toGoTime ?? (es ? "Sí" : "Yes")}` : "—"}</td>
              <td className="notes-cell">{line.notes.length ? line.notes.join(" / ") : "—"}</td>
            </tr>
          )) : <tr><td colSpan={6} className="empty-table-cell">{es ? "Sin huéspedes para el desayuno." : "No guests for breakfast."}</td></tr>}
        </tbody>
      </table></div>
      <div className="breakfast-control-totals">
        <div className="record-summary-card" data-testid="control-guests"><span>{es ? "Total huéspedes en el hotel" : "Guests in the hotel"}</span><strong>{summary.guests} pax</strong></div>
        <div className="record-summary-card" data-testid="control-included"><span>{es ? "Con desayuno incluido" : "Breakfast included"}</span><strong>{summary.includedPax} pax <small>({summary.includedRooms} {es ? "hab." : "rooms"})</small></strong></div>
      </div>
    </section>
  );
}
