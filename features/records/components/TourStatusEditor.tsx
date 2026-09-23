"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTourStatus } from "@/features/records/actions";
import type { Locale } from "@/lib/i18n";

type TourStatus = "pending" | "paid" | "cancelled";

export function TourStatusEditor({ id, status, locale }: { id: string; status: TourStatus; locale: Locale }) {
  const es = locale === "es";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [next, setNext] = useState<TourStatus>(status);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const leavesPaid = status === "paid" && next !== "paid";

  function save(formData: FormData) {
    if (leavesPaid && !reason.trim()) { setMessage(es ? "Indique el motivo." : "Enter a reason."); return; }
    startTransition(async () => {
      try {
        await setTourStatus(formData);
        setMessage(es ? "Guardado" : "Saved");
        setReason("");
        router.refresh();
      } catch {
        setMessage(es ? "No se pudo guardar." : "Could not save.");
      }
    });
  }

  return <form action={save} className="tour-status-editor">
    <input type="hidden" name="id" value={id} />
    <select name="status" value={next} onChange={(e) => setNext(e.target.value as TourStatus)} disabled={pending} aria-label={es ? "Estado del tour" : "Tour status"}>
      <option value="pending">{es ? "Pendiente" : "Pending"}</option>
      <option value="paid">{es ? "Pagado" : "Paid"}</option>
      <option value="cancelled">{es ? "Cancelado" : "Cancelled"}</option>
    </select>
    {leavesPaid && <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required placeholder={es ? "Motivo (reembolso / anulación)" : "Reason (refund / void)"} aria-label={es ? "Motivo" : "Reason"} />}
    <button className="secondary-button" disabled={pending || next === status}>{pending ? "…" : es ? "Guardar" : "Save"}</button>
    <span role="status">{message}</span>
  </form>;
}
