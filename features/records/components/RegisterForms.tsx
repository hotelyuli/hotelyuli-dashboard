"use client";
import { CalendarPlus, Palmtree, Banknote } from "lucide-react";
import { PaymentMethodOptions } from "@/components/PaymentMethodOptions";

import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { findGuestForRoom, registerEvent, registerIncome, registerTour } from "@/features/records/actions";
import { TOUR_OPERATORS, tourCommission } from "@/features/records/logic/tour-commission";
import type { Locale } from "@/lib/i18n";

import { RECEPTIONISTS } from "@/features/staff/receptionists";
import { getContacts } from "@/features/contacts/actions";
import { SupplierMessage } from "@/features/contacts/SupplierMessage";
import type { Contact } from "@/features/contacts/logic";
type Kind = "event" | "tour" | "income";

export function RegisterButton({ kind, locale, defaultBookedBy = "" }: { kind: Kind; locale: Locale; defaultBookedBy?: string }) {
  const [open, setOpen] = useState(false);
  const label = kind === "event" ? (locale === "es" ? "Reportar incidente" : "Report incident") : kind === "tour" ? (locale === "es" ? "Registrar tour" : "Register tour") : (locale === "es" ? "Registrar ingreso" : "Register income");
  const Icon = kind === "event" ? CalendarPlus : kind === "tour" ? Palmtree : Banknote;
  return <><button className={`primary-button register-trigger register-${kind}`} onClick={() => setOpen(true)}><Icon size={17} aria-hidden="true" />{label}</button>{open && <RegisterModal kind={kind} locale={locale} label={label} defaultBookedBy={defaultBookedBy} onClose={() => setOpen(false)} />}</>;
}

type TourPrefill = { roomNumber?: string; guestName?: string };

/** "Reservar tour" from a Room Board row: the tour form with room + guest pre-filled (guest stays editable). */
export function TourBookingDialog({ locale, prefill, onClose }: { locale: Locale; prefill: TourPrefill; onClose: () => void }) {
  return <RegisterModal kind="tour" locale={locale} label={locale === "es" ? "Registrar tour" : "Register tour"} defaultBookedBy="" prefill={prefill} onClose={onClose} />;
}

function RegisterModal({ kind, locale, label, defaultBookedBy, prefill, onClose }: { kind: Kind; locale: Locale; label: string; defaultBookedBy: string; prefill?: TourPrefill; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [contacts,setContacts] = useState<Contact[]>([]);
  const [contactError,setContactError] = useState(false);
  const [category,setCategory] = useState("arriving");
  // One id per opened form: re-submitting after an error re-sends the same incident instead of a new one.
  const [eventClientId] = useState(() => crypto.randomUUID());
  const [saved,setSaved] = useState<{text:string;operator?:string}|null>(null);
  useEffect(()=>{let active=true;getContacts().then(data=>{if(active)setContacts(data);}).catch(()=>{if(active)setContactError(true);});return()=>{active=false;};},[]);
  const [operator, setOperator] = useState<string>(TOUR_OPERATORS[0]);
  const [tourPrice, setTourPrice] = useState("0");
  const [tourRoom, setTourRoom] = useState(prefill?.roomNumber ?? "");
  const [tourGuest, setTourGuest] = useState(prefill?.guestName ?? "");
  const lastAutoGuest = useRef("");
  // Fill the guest from today's board when a room is typed; never overwrite a name the user typed.
  useEffect(() => {
    if (kind !== "tour" || !tourRoom.trim()) return;
    let active = true;
    const timer = setTimeout(() => {
      findGuestForRoom(tourRoom).then((guest) => {
        if (!active) return;
        // A vacant room clears a previously auto-filled name, but never a typed one.
        setTourGuest((current) => (current === "" || current === lastAutoGuest.current ? guest ?? "" : current));
        lastAutoGuest.current = guest ?? "";
      }).catch(() => {});
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, tourRoom]);
  const numericPrice = Number(tourPrice);
  const commission = Number.isFinite(numericPrice) && numericPrice >= 0 && numericPrice <= 1_000_000_000 ? tourCommission(numericPrice).toFixed(2) : "";
  const es = locale === "es";
  const today = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const time = formatInTimeZone(new Date(), "America/Costa_Rica", "HH:mm");

  function submit(formData: FormData) {
    startTransition(async () => { try { if (kind === "event") await registerEvent(formData); else if (kind === "tour") await registerTour(formData); else await registerIncome(formData); router.refresh();
      if(kind === "tour") setSaved({operator:String(formData.get("operatorName")),text:`Hotel Yuli — ${es ? "Reserva de tour" : "Tour booking"}
${es ? "Operador" : "Operator"}: ${formData.get("operatorName")}
Tour: ${formData.get("tourName")}
${es ? "Fecha" : "Date"}: ${formData.get("tourDate")}
${es ? "Huésped" : "Guest"}: ${formData.get("guestName")}
${es ? "Habitación" : "Room"}: ${formData.get("roomNumber")}
${es ? "Adultos / Niños" : "Adults / Children"}: ${formData.get("adults")} / ${formData.get("children")}
Total: ${formData.get("currency")} ${formData.get("totalPrice")}
${es ? "Notas" : "Notes"}: ${formData.get("notes")}`});
      else if(kind === "event" && category === "maintenance") setSaved({text:`Hotel Yuli — ${es ? "Incidente de mantenimiento" : "Maintenance incident"}
${es ? "Habitación / Área" : "Room / Area"}: ${formData.get("roomArea")}
${es ? "Prioridad" : "Priority"}: ${formData.get("priority")}
${formData.get("description")}
${es ? "Acción tomada" : "Action taken"}: ${formData.get("actionTaken")}`});
      else onClose(); } catch { setError(es ? "No se pudo guardar. Revise los campos." : "Could not save. Check the fields."); } });
  }

  if(saved) return <div className="modal-backdrop"><section className="team-modal record-modal" role="dialog" aria-modal="true" aria-label={es?"Registro guardado":"Record saved"}><header><h2>{es?"Registro guardado":"Record saved"}</h2><button onClick={onClose}>×</button></header><div className="saved-message"><p>{es?"Revise el mensaje antes de compartirlo con el proveedor.":"Review the message before sharing it with the supplier."}</p><pre>{saved.text}</pre>{contactError?<p role="alert">{es?"No se pudo cargar el directorio de proveedores.":"Could not load supplier contacts."}</p>:<SupplierMessage contacts={contacts} operator={saved.operator} text={saved.text} locale={locale}/>}</div><footer><button className="secondary-button" onClick={onClose}>{es?"Cerrar":"Close"}</button></footer></section></div>;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="team-modal record-modal" role="dialog" aria-modal="true"><header><h2>{label}</h2><button onClick={onClose}>×</button></header><form action={submit}>{error && <p className="form-error">{error}</p>}<div className="edit-cell-form">
    {kind === "event" && <>
      <input type="hidden" name="clientId" value={eventClientId} />
      <label>{es ? "Categoría" : "Category"}<select name="category" value={category} onChange={e=>setCategory(e.target.value)}><option value="arriving">{es ? "Llegada" : "Arriving"}</option><option value="departure">{es ? "Salida" : "Departure"}</option><option value="guest_request">{es ? "Solicitud de huésped" : "Guest request"}</option><option value="guest_complaint">{es ? "Queja de huésped" : "Guest complaint"}</option><option value="maintenance">{es ? "Mantenimiento" : "Maintenance"}</option><option value="security">{es ? "Seguridad" : "Security"}</option><option value="other">{es ? "Otro" : "Other"}</option></select></label>
      <label>{es ? "Hora" : "Time"}<input name="eventTime" type="time" defaultValue={time} required /></label>
      <label>{es ? "Habitación / Área" : "Room / Area"}<input name="roomArea" placeholder="Room 6 / Reception" /></label>
      <label>{es ? "Estado" : "Status"}<select name="status" defaultValue="completed"><option value="completed">{es ? "Completado" : "Completed"}</option><option value="temporary_solution">{es ? "Solución temporal" : "Temporary solution"}</option><option value="follow_up">{es ? "Seguimiento" : "Follow-up"}</option><option value="open">{es ? "Pendiente" : "Open"}</option></select></label>
      <label className="full-width">{es ? "Descripción" : "Description"}<textarea name="description" required /></label>
      <label className="full-width">{es ? "Acción tomada" : "Action taken"}<textarea name="actionTaken" /></label>
      <label>{es ? "Prioridad" : "Priority"}<select name="priority" defaultValue="medium"><option value="low">{es ? "Baja" : "Low"}</option><option value="medium">{es ? "Media" : "Medium"}</option><option value="high">{es ? "Alta" : "High"}</option><option value="urgent">{es ? "Urgente" : "Urgent"}</option></select></label>
      <label>{es ? "Requiere seguimiento" : "Requires follow-up"}<select name="requiresFollowUp" defaultValue="false"><option value="false">No</option><option value="true">{es ? "Sí" : "Yes"}</option></select></label>
    </>}
    {kind === "event" && category === "maintenance" && <p className="full-width">{es?"Después de guardar podrá seleccionar al proveedor y abrir WhatsApp.":"After saving, select a supplier and open WhatsApp."}</p>}
    {kind === "tour" && <>
      <label>{es ? "Habitación" : "Room"}<input name="roomNumber" value={tourRoom} onChange={e => setTourRoom(e.target.value)} maxLength={20} /></label><label>{es ? "Huésped" : "Guest"}<input name="guestName" value={tourGuest} onChange={e => setTourGuest(e.target.value)} required /></label>
      <label>{es ? "Operador" : "Operator"}<select name={operator === "other" ? undefined : "operatorName"} value={operator} onChange={e => setOperator(e.target.value)} required>{TOUR_OPERATORS.map(name => <option key={name} value={name}>{name}</option>)}<option value="other">{es ? "Otros" : "Others"}</option></select>{operator === "other" && <input name="operatorName" aria-label={es ? "Nombre del operador" : "Operator name"} placeholder={es ? "Nombre del operador" : "Operator name"} maxLength={120} required />}</label><label>Tour<select name="tourName" defaultValue="Whale Watching" required>{["Whale Watching", "Isla del Caño Snorkeling", "Corcovado", "Cataratas Nauyaca", "Alturas Wildlife Sanctuary", "Manglar de Sierpe", "Transfer", "Sound Healing", "Other"].map(tour => <option key={tour} value={tour}>{tour === "Other" && es ? "Otro" : tour}</option>)}</select></label>
      <label>{es ? "Fecha del tour" : "Tour date"}<input name="tourDate" type="date" defaultValue={today} required /></label><label>{es ? "Adultos" : "Adults"}<input name="adults" type="number" min="0" defaultValue="2" required /></label>
      <label>{es ? "Niños" : "Children"}<input name="children" type="number" min="0" defaultValue="0" required /></label><label>{es ? "Precio total" : "Total price"}<input name="totalPrice" type="number" min="0" max="1000000000" step="0.01" value={tourPrice} onChange={e => setTourPrice(e.target.value)} required /></label>
      <label>{es ? "Moneda" : "Currency"}<select name="currency" defaultValue="USD"><option>USD</option><option>CRC</option></select></label><label>{es ? "Comisión 20%" : "Commission 20%"}<input name="commissionAmount" type="number" value={commission} readOnly aria-live="polite" /><small>{es ? "Calculada automáticamente del precio total" : "Automatically calculated from the total price"}</small></label>
      <input type="hidden" name="status" value="pending" /><label>{es ? "Reservado por" : "Booked by"}<select name="bookedBy" defaultValue={RECEPTIONISTS.includes(defaultBookedBy)?defaultBookedBy:RECEPTIONISTS[0]} required>{RECEPTIONISTS.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
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
