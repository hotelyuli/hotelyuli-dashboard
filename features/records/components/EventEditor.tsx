"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateEvent } from "@/features/records/actions";
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

  return <>
    <button type="button" className="icon-button subtle" aria-label={es ? "Editar incidente" : "Edit incident"} onClick={() => { setError(""); setOpen(true); }}><Pencil size={15} /></button>
    {open && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}><section className="team-modal record-modal" role="dialog" aria-modal="true" aria-labelledby={`event-${event.id}`}>
      <header><h2 id={`event-${event.id}`}>{es ? "Editar incidente" : "Edit incident"}</h2><button type="button" onClick={() => setOpen(false)} aria-label={es ? "Cerrar" : "Close"}>×</button></header>
      <form action={save}><input type="hidden" name="id" value={event.id} /><div className="edit-cell-form">
        {error && <p role="alert" className="form-error full-width">{error}</p>}
        <label>{es ? "Estado" : "Status"}<select name="status" defaultValue={event.status}>
          <option value="completed">{es ? "Completado" : "Completed"}</option>
          <option value="temporary_solution">{es ? "Solución temporal" : "Temporary solution"}</option>
          <option value="follow_up">{es ? "Seguimiento" : "Follow-up"}</option>
          <option value="open">{es ? "Pendiente" : "Open"}</option>
        </select></label>
        <label>{es ? "Prioridad" : "Priority"}<select name="priority" defaultValue={event.priority}>
          <option value="low">{es ? "Baja" : "Low"}</option>
          <option value="medium">{es ? "Media" : "Medium"}</option>
          <option value="high">{es ? "Alta" : "High"}</option>
          <option value="urgent">{es ? "Urgente" : "Urgent"}</option>
        </select></label>
        <label>{es ? "Habitación / Área" : "Room / Area"}<input name="roomArea" defaultValue={event.roomArea ?? ""} maxLength={100} /></label>
        <label className="full-width">{es ? "Descripción" : "Description"}<textarea name="description" defaultValue={event.description} required maxLength={2000} /></label>
        <label className="full-width">{es ? "Acción tomada" : "Action taken"}<textarea name="actionTaken" defaultValue={event.actionTaken ?? ""} maxLength={2000} /></label>
        <p className="full-width panel-note">{es ? "Completado cierra su tarea abierta; volver a abrirlo reabre la tarea. Los incidentes no se pueden borrar." : "Completed closes its open task; reopening it reopens the task. Incidents cannot be deleted."}</p>
      </div><footer><button type="button" className="secondary-button" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</button><button className="primary-button" disabled={pending}>{pending ? "…" : es ? "Guardar" : "Save"}</button></footer></form>
    </section></div>}
  </>;
}
