"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateShiftSummary, saveShiftReport } from "./actions";
import { canClose, type ReportInput } from "./logic";
import { MessageActions } from "@/features/reports/components/MessageActions";
import type { Locale } from "@/lib/i18n";

type Event = { id: string; event_time: string; room_area: string | null; description: string; status: string };
export function ReportEditor({ locale, initial, events, initialText, initialRevision, initiallyClosed, aiReady, storageReady }: {
  locale: Locale; initial: ReportInput; events: Event[]; initialText: string; initialRevision: number; initiallyClosed: boolean; aiReady: boolean; storageReady: boolean;
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
      AI_NOT_CONFIGURED: ["La generación AI aún no está conectada. Puede redactar y guardar el reporte manualmente.","AI generation is not connected yet. You can write and save the report manually."],
      SOURCE_CHANGED: ["Los datos cambiaron. Revise y vuelva a generar el reporte.","Source data changed. Review and regenerate the report."],
      CONFLICT: ["Otro usuario guardó este turno. Copie su texto antes de recargar.","Another user saved this shift. Copy your text before reloading."],
      REVIEW_REQUIRED: ["Complete la revisión y confirme la entrega.","Complete the review and confirm handover."],
      ALREADY_CLOSED: ["Este turno ya está cerrado.","This shift is already closed."]
    };
    setMessage(messages[code]?.[es ? 0 : 1] ?? (es ? "No se pudo completar la acción. Su texto se mantiene aquí; inténtelo de nuevo." : "Could not complete the action. Your text is still here; please retry."));
  }
  function generate() {
    if (text.trim() && !window.confirm(es ? "¿Reemplazar el borrador actual?" : "Replace the current draft?")) return;
    start(async () => { try { const result = await generateShiftSummary(input); if (!result.ok) return failure(result.error); setText(result.text);setSourceHash(result.sourceHash);setHasGenerated(true);setSourceChanged(false);setDirty(true);setMessage(es ? "Borrador generado. Revise los hechos antes de guardar." : "Draft generated. Review the facts before saving."); } catch { failure("FAILED"); } });
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
    {!aiReady && <p role="status">{es ? "La generación AI aún no está activada. Puede preparar el texto manualmente." : "AI generation is not activated yet. You can prepare the text manually."}</p>}
    {closed && <p className="success-message">{es ? "Turno cerrado. Reporte final de solo lectura." : "Shift closed. Final report is read-only."}</p>}
    <fieldset disabled={closed || pending}><legend>{es ? "Información de la recepción" : "Reception notes"}</legend>
      <label>{es ? "Recepcionista" : "Receptionist"}<input value={input.receptionist} maxLength={120} onChange={e=>update({receptionist:e.target.value})} /></label>
      <h3>{es ? "Seleccione los incidentes de este turno" : "Select this shift's incidents"}</h3>
      <p>{es ? "Se muestran los incidentes del día; incluya solo los de esta entrega." : "These are the day's incidents; include only those relevant to this handover."}</p>
      {events.map(event => <label className="report-check" key={event.id}><input type="checkbox" checked={input.eventIds.includes(event.id)} onChange={e=>update({eventIds:e.target.checked ? [...input.eventIds,event.id] : input.eventIds.filter(id=>id!==event.id)})} /><span><strong>{event.event_time.slice(0,5)} · {event.room_area ?? "—"}</strong><br />{event.description}</span></label>)}
      {!events.length && <p>{es ? "No hay eventos registrados para esta fecha." : "No incidents recorded for this date."}</p>}
      <label>{es ? "Notas adicionales y entrega" : "Additional notes and handover"}<textarea rows={5} maxLength={6000} value={input.notes} onChange={e=>update({notes:e.target.value})} /></label>
      <p>{es ? "Marque solo las acciones que se realizaron." : "Check only actions that were actually completed."}</p>
      {confirmations.map(([key,spanish,english])=><label className="report-check" key={key}><input type="checkbox" checked={input[key]} onChange={e=>update({[key]:e.target.checked})} />{es ? spanish : english}</label>)}
    </fieldset>
    <div className="report-actions"><button className="primary-button" disabled={closed || pending || !aiReady || !storageReady || !input.receptionist.trim()} onClick={generate}>{pending ? "…" : es ? "Generar resumen con AI" : "Generate AI summary"}</button></div>
    <label>{es ? "Reporte en inglés — revise y edite" : "English report — review and edit"}<textarea className="report-text" lang="en" rows={18} maxLength={16000} value={text} readOnly={closed} disabled={pending} onChange={e=>{setText(e.target.value);setDirty(true);}} /></label>
    {sourceChanged && <p role="alert">{es ? "Cambió la información del borrador. Vuelva a generar antes de guardar." : "The draft's source information changed. Regenerate before saving."}</p>}
    <fieldset disabled={closed || pending}><legend>{es ? "Revisión antes del cierre" : "Review before closing"}</legend>{checks.map(([key,spanish,english])=><label className="report-check" key={key}><input type="checkbox" checked={input[key]} onChange={e=>update({[key]:e.target.checked})} />{es ? spanish : english}</label>)}</fieldset>
    <p role="status">{message || (dirty ? (es ? "Cambios sin guardar" : "Unsaved changes") : "")}</p>
    <div className="report-actions"><button className="secondary-button" disabled={closed || pending || !storageReady || sourceChanged || text.trim().length<20} onClick={()=>save(false)}>{es ? "Guardar borrador" : "Save draft"}</button><button className="primary-button" disabled={closed || pending || !storageReady || sourceChanged || !canClose(input) || text.trim().length<20} onClick={()=>save(true)}>{es ? "Confirmar cierre" : "Confirm close"}</button>{text && <MessageActions text={text} locale={locale} />}</div>
  </div>;
}
