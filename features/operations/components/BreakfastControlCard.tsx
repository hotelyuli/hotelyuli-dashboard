import { breakfastSheetFonts } from "@/features/operations/components/breakfast-sheet-fonts";
import { controlLongDateLabel, freeLabel, generatedLabel, type ControlSummary } from "@/features/operations/logic/breakfast-control";

/**
 * The breakfast sheet for the restaurant. One markup for the screen, Imprimir,
 * Descargar PDF and Copiar imagen; always in Spanish, whatever the UI language.
 */
export function BreakfastControlCard({ id, date, generatedAt, summary }: { id?: string; date: string; generatedAt: Date; summary: ControlSummary }) {
  return (
    <div id={id} className={`bk-sheet ${breakfastSheetFonts}`}>
      <section className="bk-card" aria-label="Control de desayunos">
        <header className="bk-head">
          <div><h2>Control de desayunos</h2><div className="bk-sub">Hotel Yuli · Uvita</div></div>
          <div className="bk-date">{controlLongDateLabel(date)}<span className="bk-gen">Generado {generatedLabel(generatedAt)}</span></div>
        </header>
        <div className="bk-scroll">
          <table className="bk-table">
            <thead><tr><th>Hab.</th><th>Huésped</th><th className="c">Pax</th><th>Desayuno</th><th>Observaciones</th><th className="c">✓</th></tr></thead>
            <tbody>
              {summary.lines.length ? summary.lines.map((line, index) => (
                <tr key={`${line.label}-${index}`} data-room={line.label}>
                  <td className="bk-room">{line.beds ? <>{line.room} <span className="bk-camas">camas</span></> : line.room}</td>
                  <td className="bk-guest">{line.names.length ? line.names.join(" / ") : "—"}</td>
                  <td className="bk-pax c">{line.pax}</td>
                  <td>
                    {line.included && <span className="bk-pill">☕ INCLUIDO{line.breakfastPax !== line.pax ? ` (${line.breakfastPax})` : ""}</span>}
                    {line.toGo && <span className="bk-togo">🥡 {line.toGoTime ?? "para llevar"}</span>}
                  </td>
                  <td className="bk-note">{line.notes.length ? `⚠️ ${line.notes.join(" / ")}` : null}</td>
                  <td className="c"><span className="bk-box" /></td>
                </tr>
              )) : <tr><td colSpan={6} className="bk-empty">Sin huéspedes para el desayuno.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bk-free" data-testid="control-free"><b>Libres:</b> {freeLabel(summary.free)}</div>
        <div className="bk-tot">
          <div className="bk-tot-a"><small>Total huéspedes en el hotel</small><strong data-testid="control-guests">{summary.guests}</strong><span>pax</span></div>
          <div className="bk-tot-b"><small>Desayunos incluidos</small><strong data-testid="control-included">{summary.includedPax}</strong><span data-testid="control-included-rooms">pax · {summary.includedRooms} hab.</span></div>
        </div>
      </section>
      <footer className="bk-foot"><span>Hotel Yuli · YuliOS</span></footer>
    </div>
  );
}
