"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban, Eye, EyeOff, Lock, Pencil } from "lucide-react";
import { setTourHidden, setTourStatus, updateTour } from "@/features/records/actions";
import { TOUR_TYPES, tourCommission } from "@/features/records/logic/tour-commission";
import type { Locale } from "@/lib/i18n";

type TourStatus = "pending" | "paid" | "cancelled";

export type EditableTour = {
  id: string;
  guest_name: string;
  room_number: string | null;
  operator_name: string;
  tour_name: string;
  tour_date: string;
  adults: number;
  children: number;
  total_price: number | string;
  commission_amount: number | string;
  currency: "USD" | "CRC";
  status: TourStatus;
};

/**
 * Per-tour actions on Booked tours. Tours are never deleted:
 * - Editar: pending tours only; a paid tour is locked.
 * - Cancelar tour: any tour not already cancelled; a paid tour's commission is
 *   reversed in Income.
 * - Ocultar: only once cancelled - hides it from the list (it stays in the database,
 *   keeps its income link and stays in the Google Sheet). "Mostrar" brings it back.
 */
export function TourActions({ tour, hidden, operators, locale }: { tour: EditableTour; hidden: boolean; operators: string[]; locale: Locale }) {
  const es = locale === "es";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"edit" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const canEdit = tour.status === "pending";
  const canCancel = tour.status !== "cancelled";
  const canHide = tour.status === "cancelled" && !hidden;

  function toggleHidden(next: boolean) {
    start(async () => {
      const result = await setTourHidden(tour.id, next);
      if (!result.ok) { setError(`${es ? "No se pudo guardar" : "Could not save"}: ${result.error}`); return; }
      setError("");
      router.refresh();
    });
  }

  return (
    <div className="tour-actions">
      {canEdit
        ? <button type="button" className="icon-button subtle" aria-label={`${es ? "Editar" : "Edit"} · ${tour.tour_name} · ${tour.guest_name}`} title={es ? "Editar" : "Edit"} disabled={pending} onClick={() => { setError(""); setDialog("edit"); }}><Pencil size={15} /></button>
        : <button type="button" className="icon-button subtle" aria-label={es ? "Edición bloqueada" : "Editing locked"} title={tour.status === "paid" ? (es ? "Pagado: bloqueado. Use Cancelar tour (anula la comisión)." : "Paid: locked. Use Cancel tour (reverses the commission).") : (es ? "Cancelado: no se edita." : "Cancelled: not editable.")} disabled><Lock size={15} /></button>}
      {canCancel && <button type="button" className="secondary-button compact-button" title={tour.status === "paid" ? (es ? "Pagado: se cancela y se anula la comisión en Ingresos" : "Paid: cancels it and reverses the commission in Income") : (es ? "Queda como Cancelado en el historial" : "Stays in history as Cancelled")} disabled={pending} onClick={() => { setError(""); setDialog("cancel"); }}><Ban size={14} />{es ? "Cancelar tour" : "Cancel tour"}</button>}
      {canHide && <button type="button" className="secondary-button compact-button" title={es ? "Ocultar de la lista. No se borra: sigue en la base de datos, en Ingresos y en Google Sheets." : "Hide from the list. Not deleted: it stays in the database, in Income and in Google Sheets."} disabled={pending} onClick={() => toggleHidden(true)}><EyeOff size={14} />{es ? "Ocultar" : "Hide"}</button>}
      {hidden && <button type="button" className="secondary-button compact-button" title={es ? "Volver a mostrar en la lista" : "Show in the list again"} disabled={pending} onClick={() => toggleHidden(false)}><Eye size={14} />{es ? "Mostrar" : "Show"}</button>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {dialog === "edit" && <EditTourModal tour={tour} operators={operators} locale={locale} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelTourModal tour={tour} locale={locale} onClose={() => setDialog(null)} />}
    </div>
  );
}

const money = (currency: string, amount: number) => `${currency} ${amount.toFixed(2)}`;

function EditTourModal({ tour, operators, locale, onClose }: { tour: EditableTour; operators: string[]; locale: Locale; onClose: () => void }) {
  const es = locale === "es";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const originalCommission = Number(tour.commission_amount);
  const [f, setF] = useState({
    guestName: tour.guest_name, roomNumber: tour.room_number ?? "", operatorName: tour.operator_name, tourName: tour.tour_name,
    tourDate: tour.tour_date, adults: String(tour.adults), children: String(tour.children),
    totalPrice: String(Number(tour.total_price)), commission: originalCommission.toFixed(2), status: tour.status as TourStatus
  });
  const [commissionTouched, setCommissionTouched] = useState(false);
  const set = (key: keyof typeof f) => (event: { target: { value: string } }) => setF((current) => ({ ...current, [key]: event.target.value }));

  function setPrice(value: string) {
    setF((current) => {
      const price = Number(value);
      // Commission follows the 20% rule until it is typed by hand.
      const commission = !commissionTouched && Number.isFinite(price) && price >= 0 && price <= 1_000_000_000 ? tourCommission(price).toFixed(2) : current.commission;
      return { ...current, totalPrice: value, commission };
    });
  }

  const newCommission = Math.round(Number(f.commission) * 100) / 100;
  // Only pending tours reach this form (paid ones are locked), so marking paid adds the commission once.
  const becomesPaid = f.status === "paid";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Number(f.commission) > Number(f.totalPrice)) { setError(es ? "La comisión no puede ser mayor que el total." : "Commission cannot exceed the total."); return; }
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await updateTour(form);
      if (!result.ok) { setError(`${es ? "No se pudo guardar" : "Could not save"}: ${result.error}`); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="team-modal record-modal" role="dialog" aria-modal="true" aria-labelledby={`edit-tour-${tour.id}`}>
        <header><h2 id={`edit-tour-${tour.id}`}>{es ? "Editar tour" : "Edit tour"}</h2><button type="button" aria-label={es ? "Cerrar" : "Close"} onClick={onClose}>×</button></header>
        <form onSubmit={submit}>
          <input type="hidden" name="id" value={tour.id} />
          <div className="edit-cell-form">
            <label>{es ? "Huésped" : "Guest"}<input name="guestName" value={f.guestName} onChange={set("guestName")} required maxLength={120} /></label>
            <label>{es ? "Habitación" : "Room"}<input name="roomNumber" value={f.roomNumber} onChange={set("roomNumber")} maxLength={20} /></label>
            <label>{es ? "Operador" : "Operator"}<input name="operatorName" value={f.operatorName} onChange={set("operatorName")} list={`operators-${tour.id}`} required maxLength={120} /><datalist id={`operators-${tour.id}`}>{operators.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label>{es ? "Tipo de tour" : "Tour type"}<input name="tourName" value={f.tourName} onChange={set("tourName")} list={`tour-types-${tour.id}`} required maxLength={120} /><datalist id={`tour-types-${tour.id}`}>{TOUR_TYPES.filter((type) => type !== "Other").map((type) => <option key={type} value={type} />)}</datalist></label>
            <label>{es ? "Fecha del tour" : "Tour date"}<input name="tourDate" type="date" value={f.tourDate} onChange={set("tourDate")} required /></label>
            <label>{es ? "Adultos" : "Adults"}<input name="adults" type="number" min={0} max={500} value={f.adults} onChange={set("adults")} required /></label>
            <label>{es ? "Niños" : "Children"}<input name="children" type="number" min={0} max={500} value={f.children} onChange={set("children")} required /></label>
            <label>{`Total (${tour.currency})`}<input name="totalPrice" type="number" min={0} step="0.01" value={f.totalPrice} onChange={(event) => setPrice(event.target.value)} required /></label>
            <label>{es ? `Comisión (${tour.currency})` : `Commission (${tour.currency})`}<input name="commission" type="number" min={0} step="0.01" value={f.commission} onChange={(event) => { setCommissionTouched(true); set("commission")(event); }} required /></label>
            <label>{es ? "Estado de pago" : "Payment status"}<select name="status" value={f.status} onChange={set("status")}><option value="pending">{es ? "Pendiente" : "Pending"}</option><option value="paid">{es ? "Pagado" : "Paid"}</option><option value="cancelled">{es ? "Cancelado" : "Cancelled"}</option></select></label>
            {becomesPaid && <p className="form-note full-width">{es ? `Se registrará la comisión ${money(tour.currency, newCommission)} en Ingresos.` : `The ${money(tour.currency, newCommission)} commission will be recorded in Income.`}</p>}
            {error && <p role="alert" className="form-error full-width">{error}</p>}
          </div>
          <footer><button type="button" className="secondary-button" onClick={onClose}>{es ? "Cancelar" : "Cancel"}</button><button className="primary-button" disabled={pending}>{pending ? "…" : es ? "Guardar" : "Save"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function CancelTourModal({ tour, locale, onClose }: { tour: EditableTour; locale: Locale; onClose: () => void }) {
  const es = locale === "es";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState(es ? "Tour cancelado" : "Tour cancelled");
  const [error, setError] = useState("");
  const paid = tour.status === "paid";
  const commission = Number(tour.commission_amount);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paid && !reason.trim()) { setError(es ? "Indique el motivo." : "Enter a reason."); return; }
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await setTourStatus(form);
      if (!result.ok) { setError(`${es ? "No se pudo cancelar" : "Could not cancel"}: ${result.error}`); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="team-modal record-modal" role="dialog" aria-modal="true" aria-labelledby={`cancel-tour-${tour.id}`}>
        <header><h2 id={`cancel-tour-${tour.id}`}>{es ? "¿Cancelar este tour?" : "Cancel this tour?"}</h2><button type="button" aria-label={es ? "Cerrar" : "Close"} onClick={onClose}>×</button></header>
        <form onSubmit={submit}>
          <input type="hidden" name="id" value={tour.id} />
          <input type="hidden" name="status" value="cancelled" />
          <div className="edit-cell-form">
            <p className="full-width"><strong>{tour.tour_name}</strong> · {tour.guest_name} · {tour.tour_date}</p>
            <p className="form-note full-width">{paid
              ? (es ? `Quedará como Cancelado y se registrará en Ingresos una anulación de la comisión (${money(tour.currency, commission)}). Después podrá ocultarlo de la lista (no se borra).` : `It becomes Cancelled and a reversal of the commission (${money(tour.currency, commission)}) is recorded in Income. You can then hide it from the list (it is not deleted).`)
              : (es ? "Quedará como Cancelado. Después podrá ocultarlo de la lista (no se borra)." : "It becomes Cancelled. You can then hide it from the list (it is not deleted).")}</p>
            <label className="full-width">{es ? "Motivo" : "Reason"}<input name="reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required={paid} /></label>
            {error && <p role="alert" className="form-error full-width">{error}</p>}
          </div>
          <footer><button type="button" className="secondary-button" onClick={onClose}>{es ? "Volver" : "Back"}</button><button className="secondary-button danger-button" disabled={pending}>{pending ? "…" : es ? "Cancelar tour" : "Cancel tour"}</button></footer>
        </form>
      </section>
    </div>
  );
}
