"use client";
import { CalendarPlus, Palmtree, Banknote } from "lucide-react";
import { PaymentMethodOptions } from "@/components/PaymentMethodOptions";

import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registerEvent, registerIncome, registerTour } from "@/features/records/actions";
import { TOUR_OPERATORS, tourCommission } from "@/features/records/logic/tour-commission";
import type { Locale } from "@/lib/i18n";

type Kind = "event" | "tour" | "income";

export function RegisterButton({ kind, locale, defaultBookedBy = "" }: { kind: Kind; locale: Locale; defaultBookedBy?: string }) {
  const [open, setOpen] = useState(false);
  const label = kind === "event" ? (locale === "es" ? "Registrar evento" : "Register event") : kind === "tour" ? (locale === "es" ? "Registrar tour" : "Register tour") : (locale === "es" ? "Registrar ingreso" : "Register income");
  const Icon = kind === "event" ? CalendarPlus : kind === "tour" ? Palmtree : Banknote;
  return <><button className={`primary-button register-trigger register-${kind}`} onClick={() => setOpen(true)}><Icon size={17} aria-hidden="true" />{label}</button>{open && <RegisterModal kind={kind} locale={locale} label={label} defaultBookedBy={defaultBookedBy} onClose={() => setOpen(false)} />}</>;
}

function RegisterModal({ kind, locale, label, defaultBookedBy, onClose }: { kind: Kind; locale: Locale; label: string; defaultBookedBy: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [operator, setOperator] = useState<string>(TOUR_OPERATORS[0]);
  const [tourPrice, setTourPrice] = useState("0");
  const numericPrice = Number(tourPrice);
  const commission = Number.isFinite(numericPrice) && numericPrice >= 0 && numericPrice <= 1_000_000_000 ? tourCommission(numericPrice).toFixed(2) : "";
  const es = locale === "es";
  const today = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const time = formatInTimeZone(new Date(), "America/Costa_Rica", "HH:mm");

  function submit(formData: FormData) {
    startTransition(async () => { try { if (kind === "event") await registerEvent(formData); else if (kind === "tour") await registerTour(formData); else await registerIncome(formData); router.refresh(); onClose(); } catch { setError(es ? "No se pudo guardar. Revise los campos." : "Could not save. Check the fields."); } });
  }

  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="team-modal record-modal" role="dialog" aria-modal="true"><header><h2>{label}</h2><button onClick={onClose}>×</button></header><form action={submit}>{error && <p className="form-error">{error}</p>}<div className="edit-cell-form">
    {kind === "event" && <>
      <label>{es ? "Categoría" : "Category"}<select name="category" defaultValue="arriving"><option value="arriving">{es ? "Llegada" : "Arriving"}</option><option value="departure">{es ? "Salida" : "Departure"}</option><option value="guest_request">{es ? "Solicitud de huésped" : "Guest request"}</option><option value="guest_complaint">{es ? "Queja de huésped" : "Guest complaint"}</option><option value="maintenance">{es ? "Mantenimiento" : "Maintenance"}</option><option value="security">{es ? "Seguridad" : "Security"}</option><option value="other">{es ? "Otro" : "Other"}</option></select></label>
      <label>{es ? "Hora" : "Time"}<input name="eventTime" type="time" defaultValue={time} required /></label>
      <label>{es ? "Habitación / Área" : "Room / Area"}<input name="roomArea" placeholder="Room 6 / Reception" /></label>
      <label>{es ? "Estado" : "Status"}<select name="status" defaultValue="completed"><option value="completed">{es ? "Completado" : "Completed"}</option><option value="temporary_solution">{es ? "Solución temporal" : "Temporary solution"}</option><option value="follow_up">{es ? "Seguimiento" : "Follow-up"}</option><option value="open">{es ? "Pendiente" : "Open"}</option></select></label>
      <label className="full-width">{es ? "Descripción" : "Description"}<textarea name="description" required /></label>
      <label className="full-width">{es ? "Acción tomada" : "Action taken"}<textarea name="actionTaken" /></label>
      <label>{es ? "Prioridad" : "Priority"}<select name="priority" defaultValue="medium"><option value="low">{es ? "Baja" : "Low"}</option><option value="medium">{es ? "Media" : "Medium"}</option><option value="high">{es ? "Alta" : "High"}</option><option value="urgent">{es ? "Urgente" : "Urgent"}</option></select></label>
      <label>{es ? "Requiere seguimiento" : "Requires follow-up"}<select name="requiresFollowUp" defaultValue="false"><option value="false">No</option><option value="true">{es ? "Sí" : "Yes"}</option></select></label>
    </>}
    {kind === "tour" && <>
      <label>{es ? "Huésped" : "Guest"}<input name="guestName" required /></label><label>{es ? "Habitación" : "Room"}<input name="roomNumber" /></label>
      <label>{es ? "Operador" : "Operator"}<select name={operator === "other" ? undefined : "operatorName"} value={operator} onChange={e => setOperator(e.target.value)} required>{TOUR_OPERATORS.map(name => <option key={name} value={name}>{name}</option>)}<option value="other">{es ? "Otros" : "Others"}</option></select>{operator === "other" && <input name="operatorName" aria-label={es ? "Nombre del operador" : "Operator name"} placeholder={es ? "Nombre del operador" : "Operator name"} maxLength={120} required />}</label><label>Tour<select name="tourName" defaultValue="Whale Watching" required>{["Whale Watching", "Isla del Caño Snorkeling", "Corcovado", "Cataratas Nauyaca", "Alturas Wildlife Sanctuary", "Manglar de Sierpe", "Transfer", "Sound Healing", "Other"].map(tour => <option key={tour} value={tour}>{tour === "Other" && es ? "Otro" : tour}</option>)}</select></label>
      <label>{es ? "Fecha del tour" : "Tour date"}<input name="tourDate" type="date" defaultValue={today} required /></label><label>{es ? "Adultos" : "Adults"}<input name="adults" type="number" min="0" defaultValue="2" required /></label>
      <label>{es ? "Niños" : "Children"}<input name="children" type="number" min="0" defaultValue="0" required /></label><label>{es ? "Precio total" : "Total price"}<input name="totalPrice" type="number" min="0" max="1000000000" step="0.01" value={tourPrice} onChange={e => setTourPrice(e.target.value)} required /></label>
      <label>{es ? "Moneda" : "Currency"}<select name="currency" defaultValue="USD"><option>USD</option><option>CRC</option></select></label><label>{es ? "Comisión 20%" : "Commission 20%"}<input name="commissionAmount" type="number" value={commission} readOnly aria-live="polite" /><small>{es ? "Calculada automáticamente del precio total" : "Automatically calculated from the total price"}</small></label>
      <input type="hidden" name="status" value="pending" /><label>{es ? "Reservado por" : "Booked by"}<input name="bookedBy" defaultValue={defaultBookedBy} required /></label>
      <label className="full-width">{es ? "Notas" : "Notes"}<input name="notes" /></label>
    </>}
    {kind === "income" && <>
      <label>{es ? "Habitación" : "Room"}<input name="roomNumber" /></label><label>{es ? "Huésped" : "Guest"}<input name="guestName" required /></label>
      <label>{es ? "¿Pagó el cliente?" : "Did the customer pay?"}<select name="paid" defaultValue="true"><option value="true">{es ? "Sí, pagado" : "Yes, paid"}</option><option value="false">{es ? "No, pendiente" : "No, pending"}</option></select></label><label>{es ? "Categoría" : "Category"}<select name="category" defaultValue="Accommodation"><option value="Accommodation">{es ? "Hospedaje" : "Accommodation"}</option><option value="Tour">Tour</option><option value="Restaurant">{es ? "Restaurante" : "Restaurant"}</option><option value="Transport">{es ? "Transporte" : "Transport"}</option><option value="Laundry">{es ? "Lavandería" : "Laundry"}</option><option value="Other">{es ? "Otro" : "Other"}</option></select></label>
      <label>{es ? "Monto" : "Amount"}<input name="amount" type="number" min="0" step="0.01" required /></label><label>{es ? "Moneda" : "Currency"}<select name="currency" defaultValue="USD"><option>USD</option><option>CRC</option></select></label>
      <label className="full-width">{es ? "Método de pago" : "Payment method"}<select name="paymentMethod" defaultValue="Visa"><PaymentMethodOptions /></select></label>
      <label className="full-width">{es ? "Referencia / Nota" : "Reference / Note"}<input name="referenceNote" /></label>
    </>}
  </div><footer><button type="button" className="secondary-button" onClick={onClose}>{es ? "Cancelar" : "Cancel"}</button><button className="primary-button" disabled={pending}>{pending ? "…" : label}</button></footer></form></section></div>;
}
