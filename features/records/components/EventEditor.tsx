"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateEvent } from "@/features/records/actions";
import { incidentStatusLabel, priorityLabel } from "@/features/records/logic/labels";
import type { Locale } from "@/lib/i18n";

export type EditableEvent = {
  id: string;
  status: string;
  priority: string;
  roomArea: string | null;
  description: string;
  actionTaken: string | null;
};

export function EventEditor({ event, locale }: { event: EditableEvent; locale: Locale }) {
  const es = locale === "es";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await updateEvent(formData);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  const lang = es ? "es" : "en";
  // Legacy values (temporary_solution / urgent) only get a segment when the incident already has one, so saving never changes them silently.
  const statuses = ["open", "follow_up", ...(event.status === "temporary_solution" ? ["temporary_solution"] : []), "completed"];
  const priorities = ["low", "medium", "high", ...(event.priority === "urgent" ? ["urgent"] : [])];
  const titleId = `event-${event.id}`;

  return <>
    <button type="button" className="icon-button subtle" aria-label={es ? "Editar incidente" : "Edit incident"} onClick={() => { setError(""); setOpen(true); }}><Pencil size={15} /></button>
    {open && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}><section className="incident-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><h2 id={titleId}>{es ? "Editar incidente" : "Edit incident"}</h2><button type="button" onClick={() => setOpen(false)} aria-label={es ? "Cerrar" : "Close"}>×</button></header>
      <form action={save}><input type="hidden" name="id" value={event.id} />
        <div className="incident-modal-body">
          {error && <p role="alert" className="form-error">{error}</p>}
          <fieldset className="incident-field">
            <legend>{es ? "Estado" : "Status"}</legend>
            <div className="segmented">{statuses.map((value) => <label key={value} className={`segment status-${value}`}><input type="radio" name="status" value={value} defaultChecked={event.status === value} /><span>{incidentStatusLabel(value, lang)}</span></label>)}</div>
            <p className="incident-hint">{es ? "Completado cierra su tarea abierta; volver a abrirlo reabre la tarea. Los incidentes no se pueden borrar." : "Completed closes its open task; reopening it reopens the task. Incidents cannot be deleted."}</p>
          </fieldset>
          <fieldset className="incident-field">
            <legend>{es ? "Prioridad" : "Priority"}</legend>
            <div className="segmented">{priorities.map((value) => <label key={value} className={`segment priority-${value}`}><input type="radio" name="priority" value={value} defaultChecked={event.priority === value} /><span>{priorityLabel(value, lang)}</span></label>)}</div>
          </fieldset>
          <label className="incident-field"><span>{es ? "Habitación / Área" : "Room / Area"}</span><input className="room-input" name="roomArea" defaultValue={event.roomArea ?? ""} maxLength={100} /></label>
          <label className="incident-field"><span>{es ? "Descripción" : "Description"}</span><textarea name="description" rows={3} defaultValue={event.description} required maxLength={2000} /></label>
          <label className="incident-field"><span>{es ? "Acción tomada" : "Action taken"}</span><textarea name="actionTaken" rows={3} defaultValue={event.actionTaken ?? ""} maxLength={2000} /></label>
        </div>
        <footer><button type="button" className="secondary-button" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</button><button className="primary-button" disabled={pending}>{pending ? "…" : es ? "Guardar" : "Save"}</button></footer>
      </form>
    </section></div>}
  </>;
}
