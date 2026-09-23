"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Save } from "lucide-react";
import { updateTask } from "@/features/records/actions";
import { RECEPTIONISTS } from "@/features/staff/receptionists";
import { HOUSEKEEPERS } from "@/features/operations/logic/room-setup";
import type { Locale } from "@/lib/i18n";

// Suggestions only: any name can be typed.
const STAFF = [...RECEPTIONISTS, ...HOUSEKEEPERS.filter((name) => name !== "Other")];

/**
 * Controlled inputs + onSubmit (not <form action>): React 19 resets uncontrolled
 * forms as soon as a form action returns, which made saved values appear to
 * revert. The server action returns its real error instead of throwing.
 */
export function TaskEditor({ id, status, assignedTo, locale }: { id: string; status: string; assignedTo: string | null; locale: Locale }) {
  const es = locale === "es";
  const router = useRouter();
  const listId = useId();
  const [pending, startTransition] = useTransition();
  const [nextStatus, setNextStatus] = useState(status);
  const [assignee, setAssignee] = useState(assignedTo ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = nextStatus !== status || assignee.trim() !== (assignedTo ?? "");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData();
    form.set("id", id);
    form.set("status", nextStatus);
    form.set("assignedTo", assignee);
    startTransition(async () => {
      const result = await updateTask(form);
      if (!result.ok) { setSaved(false); setError(result.error); return; }
      setError("");
      setSaved(true);
      router.refresh();
    });
  }

  return <form className="task-editor" onSubmit={save}>
    <label>{es ? "Estado" : "Status"}
      <select value={nextStatus} onChange={(e) => { setNextStatus(e.target.value); setSaved(false); }} disabled={pending}>
        <option value="open">{es ? "Pendiente" : "Open"}</option>
        <option value="in_progress">{es ? "En progreso" : "In progress"}</option>
        <option value="completed">{es ? "Completado" : "Completed"}</option>
        <option value="cancelled">{es ? "Cancelado" : "Cancelled"}</option>
      </select>
    </label>
    <label>{es ? "Responsable" : "Assigned to"}
      <input value={assignee} onChange={(e) => { setAssignee(e.target.value); setSaved(false); }} list={listId} maxLength={120} placeholder={es ? "Elegir o escribir un nombre" : "Pick or type a name"} disabled={pending} />
      <datalist id={listId}>{STAFF.map((name) => <option key={name} value={name} />)}</datalist>
    </label>
    <div className="task-editor-footer">
      <button className="secondary-button" disabled={pending || !dirty}><Save size={14} aria-hidden="true" />{pending ? "…" : es ? "Guardar" : "Save"}</button>
      {saved && !dirty && <span className="task-saved" role="status"><Check size={14} aria-hidden="true" />{es ? "Guardado" : "Saved"}</span>}
    </div>
    {error && <p className="form-error" role="alert">{es ? "No se pudo guardar" : "Could not save"}: {error}</p>}
  </form>;
}
