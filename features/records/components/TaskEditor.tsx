"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Save } from "lucide-react";
import { updateTask } from "@/features/records/actions";
import type { Locale } from "@/lib/i18n";

/**
 * Inline status editor on /tasks. Controlled select + onSubmit (not <form action>,
 * which React 19 auto-resets). Shows "Guardado" only after the server confirms the
 * stored status, and the server's real error otherwise.
 */
export function TaskEditor({ id, status, locale }: { id: string; status: string; locale: Locale }) {
  const es = locale === "es";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(status);
  const [nextStatus, setNextStatus] = useState(status);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const dirty = nextStatus !== saved;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData();
    form.set("id", id);
    form.set("status", nextStatus);
    startTransition(async () => {
      const result = await updateTask(form);
      if (!result.ok) { setConfirmed(false); setError(result.error); return; }
      setError("");
      setSaved(nextStatus);
      setConfirmed(true);
      router.refresh();
    });
  }

  return <form className="task-editor" onSubmit={save}>
    <label>{es ? "Estado" : "Status"}
      <select value={nextStatus} onChange={(e) => { setNextStatus(e.target.value); setConfirmed(false); setError(""); }} disabled={pending}>
        <option value="open">{es ? "Pendiente" : "Open"}</option>
        <option value="in_progress">{es ? "En progreso" : "In progress"}</option>
        <option value="completed">{es ? "Completado" : "Completed"}</option>
        <option value="cancelled">{es ? "Cancelado" : "Cancelled"}</option>
      </select>
    </label>
    <div className="task-editor-footer">
      <button className="secondary-button" disabled={pending || !dirty}><Save size={14} aria-hidden="true" />{pending ? "…" : es ? "Guardar" : "Save"}</button>
      {confirmed && !dirty && <span className="task-saved" role="status"><Check size={14} aria-hidden="true" />{es ? "Guardado" : "Saved"}</span>}
    </div>
    {error && <p className="form-error" role="alert">{es ? "No se pudo guardar" : "Could not save"}: {error}</p>}
  </form>;
}
