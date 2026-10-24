"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmImportRetirement } from "@/features/csv-import/actions";
import type { RetirementCandidate, RetirementResult } from "@/features/operations/services/retirement";

const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Whether ordinary candidates (no money in YuliOS, not from a check-out file) start ticked. false
 * until we know whether a later Little Hotelier check-in report still lists guests already checked
 * in and no-shows (the 5-step report test): until then every row needs its own tick.
 */
export const TICK_ORDINARY_CANDIDATES_BY_DEFAULT = false;

/**
 * After an import: stored reservations the file no longer lists. Nothing is retired until a person
 * ticks the rows and confirms. Every row starts unticked (TICK_ORDINARY_CANDIDATES_BY_DEFAULT). A row
 * with money recorded in YuliOS is red; a row from a check-out file says the stay may have been
 * extended in Little Hotelier; "Pagado (LH)" (paid per LH's balance only) is information only.
 */
/** `onConfirmed`: the ticked rows were retired / flagged. `onDismiss`: close the dialog without confirming. */
export function RetirementNotice({ importId, result, es, onConfirmed, onDismiss }: { importId: string; result: RetirementResult; es: boolean; onConfirmed?: () => void; onDismiss?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(TICK_ORDINARY_CANDIDATES_BY_DEFAULT ? result.candidates.filter((c) => !c.has_payment && !c.may_be_extended).map((c) => c.reservation_id) : []));
  const [applied, setApplied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const warnings = [
    ...(result.status === "skipped_file" ? [es ? `El archivo tiene ${result.invalid_rows} filas que no se pudieron leer: no se revisó ninguna reserva para retirar.` : `The file has ${result.invalid_rows} rows that could not be read: no booking was checked for retirement.`] : []),
    ...result.skipped_dates.map((skipped) => skipped.reason === "unresolved_room"
      ? (es ? `${day(skipped.date)}: una habitación del archivo no se reconoció; no se retira nada de ese día.` : `${day(skipped.date)}: a room in the file was not recognised; nothing is retired for that day.`)
      : (es ? `${day(skipped.date)}: fecha anterior a ayer; nunca se retira.` : `${day(skipped.date)}: before yesterday; never retired.`))
  ];

  function label(candidate: RetirementCandidate) {
    const what = candidate.kind === "moved_in_lh"
      ? (es ? `en Little Hotelier está en ${candidate.lh_room ?? "otra habitación"} (se marca para revisar)` : `Little Hotelier has it in ${candidate.lh_room ?? "another room"} (flagged for review)`)
      : (es ? "ya no está en Little Hotelier (se retira)" : "no longer in Little Hotelier (retired)");
    return `${day(candidate.date)} · ${candidate.room} · ${candidate.guest ?? "—"}${candidate.reference ? ` · ${candidate.reference}` : ""} · ${what}`;
  }

  function confirm() {
    setError(null);
    const ids = [...ticked];
    startTransition(async () => {
      const outcome = await confirmImportRetirement(importId, ids);
      if (!outcome.ok) { setError(outcome.error); return; }
      setApplied(ids.length);
      router.refresh();
      onConfirmed?.();
    });
  }

  return (
    <div className="import-retirement" role={result.status === "needs_confirmation" && applied === null ? "alert" : "status"}>
      {warnings.map((warning) => <p key={warning} className="import-retirement-warning">{warning}</p>)}
      {result.status === "needs_confirmation" && (applied !== null ? (
        <p>{es ? `Listo: ${applied} reservas ya no cuentan (revisar en Operaciones › Reservas por revisar).` : `Done: ${applied} bookings no longer count (see Operations › Bookings to review).`}</p>
      ) : (
        <>
          <p>{es ? "Estas reservas ya no están en el archivo de Little Hotelier para ese día. No se cambió nada: marque las que de verdad ya no cuentan y confirme." : "These bookings are no longer in the Little Hotelier file for that day. Nothing was changed: tick the ones that really no longer count and confirm."}</p>
          <ul className="import-retirement-list">
            {result.candidates.map((candidate) => (
              <li key={candidate.reservation_id} className={candidate.has_payment ? "has-payment" : undefined}>
                <label>
                  <input type="checkbox" checked={ticked.has(candidate.reservation_id)} onChange={(event) => setTicked((current) => { const next = new Set(current); if (event.target.checked) next.add(candidate.reservation_id); else next.delete(candidate.reservation_id); return next; })} />
                  {label(candidate)}
                </label>
                {candidate.may_be_extended && <small>{es ? "Puede haberse extendido en Little Hotelier: el huésped puede seguir en el hotel." : "May have been extended in Little Hotelier: the guest may still be in-house."}</small>}
                {candidate.has_payment && <small className="payment-warning">{es ? "Tiene dinero registrado en YuliOS (ingreso, o Pagado / Parcial puesto a mano): márquela solo si está seguro." : "Has money recorded in YuliOS (income, or Paid / Partial set by hand): tick only if you are sure."}</small>}
                {candidate.lh_paid && <span className="lh-paid-chip">{es ? "Pagado (LH)" : "Paid (LH)"}</span>}
              </li>
            ))}
          </ul>
          <div className="import-retirement-actions">
            {onDismiss && <button type="button" className="secondary-button" onClick={onDismiss} disabled={pending}>{es ? "Cerrar sin confirmar" : "Close without confirming"}</button>}
            <button type="button" className="primary-button" onClick={confirm} disabled={pending || ticked.size === 0}>{pending ? "…" : es ? `Confirmar (${ticked.size} seleccionadas)` : `Confirm (${ticked.size} selected)`}</button>
          </div>
        </>
      ))}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
