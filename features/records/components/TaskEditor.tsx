"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTask } from "@/features/records/actions";
import type { Locale } from "@/lib/i18n";

export function TaskEditor({ id, status, assignedTo, locale }: { id: string; status: string; assignedTo: string | null; locale: Locale }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const es = locale === "es";
  function save(formData: FormData) {
    startTransition(async () => {
      try {
        await updateTask(formData);
        setMessage(es ? "Guardado" : "Saved");
        router.refresh();
      } catch {
        setMessage(es ? "No se pudo guardar." : "Could not save.");
      }
    });
  }
  return <form action={save}>
    <input type="hidden" name="id" value={id} />
    <label>{es ? "Estado" : "Status"}<select name="status" defaultValue={status} disabled={pending}>
      <option value="open">{es ? "Pendiente" : "Open"}</option>
      <option value="in_progress">{es ? "En progreso" : "In progress"}</option>
      <option value="completed">{es ? "Completado" : "Completed"}</option>
      <option value="cancelled">{es ? "Cancelado" : "Cancelled"}</option>
    </select></label>
    <label>{es ? "Responsable" : "Assigned to"}<input name="assignedTo" defaultValue={assignedTo ?? ""} maxLength={120} disabled={pending} /></label>
    <button className="secondary-button" disabled={pending}>{pending ? "…" : es ? "Guardar" : "Save"}</button>
    <span role="status">{message}</span>
  </form>;
}
