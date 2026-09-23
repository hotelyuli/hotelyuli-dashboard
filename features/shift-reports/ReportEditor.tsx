"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateShiftReport, saveShiftReport } from "./actions";
import { canClose, type ReportInput } from "./logic";
import { MessageActions } from "@/features/reports/components/MessageActions";
import type { Locale } from "@/lib/i18n";

type Event = { id: string; event_time: string; room_area: string | null; description: string; status: string };
export function ReportEditor({ locale, initial, events, initialText, initialRevision, initiallyClosed, storageReady }: {
  locale: Locale; initial: ReportInput; events: Event[]; initialText: string; initialRevision: number; initiallyClosed: boolean; storageReady: boolean;
}) {
  const es = locale === "es";
  const router = useRouter();
  const [input, setInput] = useState(initial);
  const [text, setText] = useState(initialText);
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [revision, setRevision] = useState(initialRevision);
  const [closed, setClosed] = useState(initiallyClosed);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [sourceChanged, setSourceChanged] = useState(false);
  const [dirty, setDirty] = useState(false);
  function update(patch: Partial<ReportInput>) {
    setInput(current => ({ ...current, ...patch })); setDirty(true);
    if (hasGenerated && Object.keys(patch).some(key => ["eventIds","notes","receptionist","breakfastSent","arrivalsContacted","takeawayReady"].includes(key))) setSourceChanged(true);
  }
  function failure(code: string) {
    const messages: Record<string, [string,string]> = {
      SOURCE_CHANGED: ["Los datos cambiaron. Revise y vuelva a generar el reporte.","Source data changed. Review and regenerate the report."],
      CONFLICT: ["Otro usuario guardó este turno. Copie su texto antes de recargar.","Another user saved this shift. Copy your text before reloading."],
      REVIEW_REQUIRED: ["Complete la revisión y confirme la entrega.","Complete the review and confirm handover."],
      ALREADY_CLOSED: ["Este turno ya está cerrado.","This shift is already closed."]
    };
    // Known codes get a friendly sentence; anything else (e.g. "SOURCE_LOAD_FAILED: <db error>") is shown as-is.
    const known = messages[code]?.[es ? 0 : 1];
    setMessage(known ?? `${es ? "No se pudo completar la acción; su texto se mantiene aquí." : "Could not complete the action; your text is still here."} (${code})`);
  }
  function generate() {
    if (text.trim() && !window.confirm(es ? "¿Reemplazar el texto actual del reporte? Se perderán las ediciones hechas a mano." : "Replace the current report text? Manual edits to it will be lost.")) return;
    start(async () => { try { const result = await generateShiftReport(input); if (!result.ok) return failure(result.error); setText(result.text);setSourceHash(result.sourceHash);setHasGenerated(true);setSourceChanged(false);setDirty(true);setMessage(result.generator === "ai" ? (es ? `Reporte redactado con Claude (${result.model}) a partir de los registros y sus notas. Revise los hechos antes de guardar.` : `Report written by Claude (${result.model}) from the saved records and your notes. Check the facts before saving.`) : result.warning ? (es ? `No se pudo usar la IA (${result.warning}); se generó el reporte estructurado.` : `AI was unavailable (${result.warning}); the structured report was generated instead.`) : (es ? "Reporte estructurado generado (IA no configurada). Revíselo antes de guardar." : "Structured report generated (AI not configured). Review it before saving.")); } catch (caught) { failure(caught instanceof Error ? caught.message : "FAILED"); } });
  }
  function save(close: boolean) {
    if (close && !window.confirm(es ? "¿Guardar el reporte final y cerrar el turno? El reporte cerrado no se puede editar." : "Save the final report and close this shift? A closed report cannot be edited.")) return;
    start(async () => { try { const result = await saveShiftReport(input,text,revision,close,sourceHash); if (!result.ok) return failure(result.error);setRevision(result.revision);setClosed(result.closed);setDirty(false);setMessage(result.closed ? (es ? "Turno cerrado y reporte guardado." : "Shift closed and report saved.") : (es ? "Borrador guardado." : "Draft saved."));router.refresh(); } catch { failure("FAILED"); } });
  }
  const confirmations: [keyof Pick<ReportInput,"breakfastSent"|"arrivalsContacted"|"takeawayReady">,string,string][] = [
    ["breakfastSent","Reporte de desayuno enviado a Aura","Breakfast report sent to Aura"],
    ["arrivalsContacted","Huéspedes de mañana contactados","Tomorrow's arrivals contacted"],
    ["takeawayReady","Desayunos para llevar preparados","Takeaway breakfasts prepared"]
  ];
  const checks: [keyof Pick<ReportInput,"eventsReviewed"|"tasksReviewed"|"breakfastReviewed"|"incomeReviewed"|"cashReviewed"|"handover">,string,string][] = [
    ["eventsReviewed","Revisé los incidentes y el reporte","I reviewed the incidents and report"],
    ["tasksReviewed","Revisé los pendientes y responsables","I reviewed open tasks and responsibilities"],
    ...(input.shift === "morning" ? [] : [
      ["breakfastReviewed","Revisé el desayuno","I reviewed breakfast"],
      ["incomeReviewed","Revisé los ingresos USD y CRC por separado","I reviewed USD and CRC income separately"],
      ["cashReviewed","Revisé la conciliación de caja","I reviewed cash reconciliation"]
    ] as ["breakfastReviewed"|"incomeReviewed"|"cashReviewed",string,string][]),
    ["handover","Confirmo la entrega de pendientes al siguiente turno","I confirm handover of pending items to the next shift"]
  ];
  return <div className="report-editor">
    {!storageReady && <p role="alert">{es ? "El almacenamiento de reportes está pendiente de activación. No es posible guardar o cerrar todavía." : "Report storage is awaiting activation. Saving and closing are not available yet."}</p>}
    {closed && <p className="success-message">{es ? "Turno cerrado. Reporte final de solo lectura." : "Shift closed. Final report is read-only."}</p>}
    <fieldset disabled={closed || pending}><legend>{es ? "Información de la recepción" : "Reception notes"}</legend>
      <label>{es ? "Recepcionista" : "Receptionist"}<input value={input.receptionist} maxLength={120} onChange={e=>update({receptionist:e.target.value})} /></label>
      <h3>{es ? "Incidentes incluidos en el reporte" : "Incidents included in the report"}</h3>
      <p>{es ? "Todos los incidentes del día están incluidos; desmarque los que pertenezcan a otro turno." : "All of the day's incidents are included; untick any that belong to another shift."}</p>
      {events.map(event => <label className="report-check" key={event.id}><input type="checkbox" checked={input.eventIds.includes(event.id)} onChange={e=>update({eventIds:e.target.checked ? [...input.eventIds,event.id] : input.eventIds.filter(id=>id!==event.id)})} /><span><strong>{event.event_time.slice(0,5)} · {event.room_area ?? "—"}</strong><br />{event.description}</span></label>)}
      {!events.length && <p>{es ? "No hay eventos registrados para esta fecha." : "No incidents recorded for this date."}</p>}
      <label>{es ? "Notas del turno (español o inglés): comentarios de huéspedes, observaciones, recomendaciones. Se incorporan al reporte en inglés sin añadir nada que no esté aquí." : "Shift notes (Spanish or English): guest feedback, observations, recommendations. They are woven into the English report without adding anything that is not here."}<textarea rows={5} maxLength={6000} value={input.notes} onChange={e=>update({notes:e.target.value})} placeholder={es ? "Ej.: La pareja de la Hab 7 felicitó al equipo de desayuno. Recomiendo revisar la presión del agua en la Hab 12." : "E.g. The couple in Room 7 praised the breakfast team. I recommend checking the water pressure in Room 12."} /></label>
      <p>{es ? "Marque solo las acciones que se realizaron." : "Check only actions that were actually completed."}</p>
      {confirmations.map(([key,spanish,english])=><label className="report-check" key={key}><input type="checkbox" checked={input[key]} onChange={e=>update({[key]:e.target.checked})} />{es ? spanish : english}</label>)}
    </fieldset>
    <div className="report-actions"><button className="primary-button" disabled={closed || pending || !input.receptionist.trim()} onClick={generate}>{pending ? "…" : text.trim() ? (es ? "Actualizar reporte" : "Update report") : (es ? "Generar reporte" : "Generate report")}</button></div>
    <label>{es ? "Reporte en inglés — revise y edite" : "English report — review and edit"}<textarea className="report-text" lang="en" rows={18} maxLength={16000} value={text} readOnly={closed} disabled={pending} onChange={e=>{setText(e.target.value);setDirty(true);}} /></label>
    {sourceChanged && <p role="alert">{es ? "Cambió la información del borrador. Vuelva a generar antes de guardar." : "The draft's source information changed. Regenerate before saving."}</p>}
    <fieldset disabled={closed || pending}><legend>{es ? "Revisión antes del cierre" : "Review before closing"}</legend>{checks.map(([key,spanish,english])=><label className="report-check" key={key}><input type="checkbox" checked={input[key]} onChange={e=>update({[key]:e.target.checked})} />{es ? spanish : english}</label>)}</fieldset>
    <p role="status">{message || (dirty ? (es ? "Cambios sin guardar" : "Unsaved changes") : "")}</p>
    <div className="report-actions"><button className="secondary-button" disabled={closed || pending || !storageReady || sourceChanged || text.trim().length<20} onClick={()=>save(false)}>{es ? "Guardar reporte final" : "Save final report"}</button><button className="primary-button" disabled={closed || pending || !storageReady || sourceChanged || !canClose(input) || text.trim().length<20} onClick={()=>save(true)}>{es ? "Confirmar cierre" : "Confirm closing"}</button>{text && <MessageActions text={text} locale={locale} />}</div>
  </div>;
}
