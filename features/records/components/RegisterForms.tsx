"use client";
import { PaymentMethodOptions } from "@/components/PaymentMethodOptions";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registerEvent, registerIncome, registerTour } from "@/features/records/actions";
import type { Locale } from "@/lib/i18n";

type Kind = "event" | "tour" | "income";

export function RegisterButton({ kind, locale, defaultBookedBy = "" }: { kind: Kind; locale: Locale; defaultBookedBy?: string }) {
  const [open, setOpen] = useState(false);
  const label = kind === "event" ? (locale === "es" ? "Registrar evento" : "Register event") : kind === "tour" ? (locale === "es" ? "Registrar tour" : "Register tour") : (locale === "es" ? "Registrar ingreso" : "Register income");
  return <><button className="primary-button" onClick={() => setOpen(true)}>+ {label}</button>{open && <RegisterModal kind={kind} locale={locale} label={label} defaultBookedBy={defaultBookedBy} onClose={() => setOpen(false)} />}</>;
}

function RegisterModal({ kind, locale, label, defaultBookedBy, onClose }: { kind: Kind; locale: Locale; label: string; defaultBookedBy: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const es = locale === "es";
  const today = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 5);

  function submit(formData: FormData) {
    startTransition(async () => { try { if (kind === "event") await registerEvent(formData); else if (kind === "tour") await registerTour(formData); else await registerIncome(formData); router.refresh(); onClose(); } catch { setError(es ? "No se pudo guardar. Revise los campos." : "Could not save. Check the fields."); } });
  }

  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="team-modal record-modal" role="dialog" aria-modal="true"><header><h2>{label}</h2><button onClick={onClose}>×</button></header><form action={submit}>{error && <p className="form-error">{error}</p>}<div className="edit-cell-form">
    {kind === "event" && <>
      <label>{es ? "Categoría" : "Category"}<select name="category" defaultValue="arriving"><option value="arriving">Arriving</option><option value="departure">Departure</option><option value="guest_request">Guest request</option><option value="guest_complaint">Guest complaint</option><option value="maintenance">Maintenance</option><option value="security">Security</option><option value="other">Other</option></select></label>
      <label>{es ? "Hora" : "Time"}<input name="eventTime" type="time" defaultValue={time} required /></label>
      <label>{es ? "Habitación / Área" : "Room / Area"}<input name="roomArea" placeholder="Room 6 / Reception" /></label>
      <label>{es ? "Estado" : "Status"}<select name="status" defaultValue="completed"><option value="completed">Completed</option><option value="temporary_solution">Temporary solution</option><option value="follow_up">Follow-up</option><option value="open">Open</option></select></label>
      <label className="full-width">{es ? "Descripción" : "Description"}<textarea name="description" required /></label>
      <label className="full-width">{es ? "Acción tomada" : "Action taken"}<textarea name="actionTaken" /></label>
      <label>{es ? "Prioridad" : "Priority"}<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label>{es ? "Requiere seguimiento" : "Requires follow-up"}<select name="requiresFollowUp" defaultValue="false"><option value="false">No</option><option value="true">Yes</option></select></label>
    </>}
    {kind === "tour" && <>
      <label>{es ? "Huésped" : "Guest"}<input name="guestName" required /></label><label>{es ? "Habitación" : "Room"}<input name="roomNumber" /></label>
      <label>{es ? "Operador" : "Operator"}<input name="operatorName" defaultValue="Ballena Tours" required /></label><label>Tour<input name="tourName" defaultValue="Whale Watching" required /></label>
      <label>{es ? "Fecha del tour" : "Tour date"}<input name="tourDate" type="date" defaultValue={today} required /></label><label>Adults<input name="adults" type="number" min="0" defaultValue="2" required /></label>
      <label>Children<input name="children" type="number" min="0" defaultValue="0" required /></label><label>{es ? "Precio total" : "Total price"}<input name="totalPrice" type="number" min="0" step="0.01" defaultValue="0" required /></label>
      <label>Currency<select name="currency" defaultValue="USD"><option>USD</option><option>CRC</option></select></label><label>{es ? "Comisión" : "Commission"}<input name="commissionAmount" type="number" min="0" step="0.01" defaultValue="0" required /></label>
      <input type="hidden" name="status" value="pending" /><label>{es ? "Reservado por" : "Booked by"}<input name="bookedBy" defaultValue={defaultBookedBy} required /></label>
      <label className="full-width">Notes<input name="notes" /></label>
    </>}
    {kind === "income" && <>
      <label>{es ? "Habitación" : "Room"}<input name="roomNumber" /></label><label>{es ? "Huésped" : "Guest"}<input name="guestName" required /></label>
      <label>{es ? "¿Pagó el cliente?" : "Did the customer pay?"}<select name="paid" defaultValue="true"><option value="true">{es ? "Sí, pagado" : "Yes, paid"}</option><option value="false">{es ? "No, pendiente" : "No, pending"}</option></select></label><label>{es ? "Categoría" : "Category"}<select name="category" defaultValue="Accommodation"><option>Accommodation</option><option>Tour</option><option>Restaurant</option><option>Transport</option><option>Other</option></select></label>
      <label>{es ? "Monto" : "Amount"}<input name="amount" type="number" min="0" step="0.01" required /></label><label>Currency<select name="currency" defaultValue="USD"><option>USD</option><option>CRC</option></select></label>
      <label className="full-width">{es ? "Método de pago" : "Payment method"}<select name="paymentMethod" defaultValue="Visa"><PaymentMethodOptions /></select></label>
      <label className="full-width">{es ? "Referencia / Nota" : "Reference / Note"}<input name="referenceNote" /></label>
    </>}
  </div><footer><button type="button" className="secondary-button" onClick={onClose}>{es ? "Cancelar" : "Cancel"}</button><button className="primary-button" disabled={pending}>{pending ? "…" : label}</button></footer></form></section></div>;
}
