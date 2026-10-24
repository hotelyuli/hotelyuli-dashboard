"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewRetiredReservation } from "@/features/operations/actions";
import type { RetirementReviewItem } from "@/features/operations/services/active-reservations";
import type { Locale } from "@/lib/i18n";

const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * "Reservas por revisar": what imports retired (no longer in Little Hotelier) or flagged (Little
 * Hotelier has them in another room). They already don't count; staff confirm or restore.
 */
export function RetiredReservationsPanel({ items, roomLabels, locale }: { items: RetirementReviewItem[]; roomLabels: Record<string, string>; locale: Locale }) {
  const es = locale === "es";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!items.length) return null;

  function decide(reservationId: string, decision: "confirm" | "restore") {
    setError(null);
    const data = new FormData();
    data.set("reservationId", reservationId);
    data.set("decision", decision);
    startTransition(async () => {
      const result = await reviewRetiredReservation(data);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  return (
    <section className="retired-review" aria-labelledby="retired-review-title">
      <h2 id="retired-review-title">{es ? `Reservas por revisar (${items.length})` : `Bookings to review (${items.length})`}</h2>
      <p className="form-hint">{es ? "La última importación de Little Hotelier ya no las lista en esa habitación. Ya no cuentan en el tablero ni en los totales." : "The latest Little Hotelier import no longer lists them in that room. They no longer count on the board or in totals."}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span><strong>{roomLabels[item.roomId] ?? "—"}</strong> · {item.guest ?? "—"}{item.reference ? ` · ${item.reference}` : ""} · {day(item.arrivalDate)}–{day(item.departureDate)}</span>
            <small>{item.kind === "moved_in_lh"
              ? (es ? `Little Hotelier la tiene en ${item.lhRoom ?? "otra habitación"}` : `Little Hotelier has it in ${item.lhRoom ?? "another room"}`)
              : (es ? "Ya no está en Little Hotelier (cancelada o eliminada)" : "No longer in Little Hotelier (cancelled or deleted)")}</small>
            <span className="retired-review-actions">
              <button type="button" className="secondary-button" disabled={pending} onClick={() => decide(item.id, "confirm")}>{es ? "Confirmar" : "Confirm"}</button>
              <button type="button" className="secondary-button" disabled={pending} onClick={() => decide(item.id, "restore")}>{es ? "Restaurar" : "Restore"}</button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
