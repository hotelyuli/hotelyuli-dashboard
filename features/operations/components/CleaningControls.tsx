"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, ClipboardCheck } from "lucide-react";
import { advanceCleaningStatus } from "@/features/operations/actions";
import { cleaningStatusLabel, type CleaningStatus } from "@/features/operations/logic/cleaning";
import type { Locale } from "@/lib/i18n";

/** Status tag + the one action that applies next (pending -> inspection -> clean). */
export function CleaningControls({ rowId, status, locale }: { rowId: string; status: CleaningStatus; locale: Locale }) {
  const es = locale === "es";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function advance(action: "mark_ready" | "pass_inspection") {
    const form = new FormData();
    form.set("rowId", rowId);
    form.set("action", action);
    startTransition(async () => {
      const result = await advanceCleaningStatus(form);
      setError(result.ok ? "" : result.error);
      router.refresh();
    });
  }

  return <div className="cleaning-controls">
    <span className={`cleaning-tag cleaning-${status}`}>{cleaningStatusLabel(status, locale).toUpperCase()}</span>
    {status === "pending" && <button type="button" className="secondary-button cleaning-action" disabled={pending} onClick={() => advance("mark_ready")}><ClipboardCheck size={15} aria-hidden="true" />{pending ? "…" : es ? "Lista para inspección" : "Ready for inspection"}</button>}
    {status === "ready_for_inspection" && <button type="button" className="primary-button cleaning-action" disabled={pending} onClick={() => advance("pass_inspection")}><CheckCheck size={15} aria-hidden="true" />{pending ? "…" : es ? "Aprobar inspección" : "Pass inspection"}</button>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
