import { getContacts } from "@/features/contacts/actions";
import { SupplierMessage } from "@/features/contacts/SupplierMessage";
import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import { TourStatusEditor } from "@/features/records/components/TourStatusEditor";
import type { Locale } from "@/lib/i18n";
import { selectedTourDay } from "@/features/records/logic/tour-day";
import { TourActions, type EditableTour } from "@/features/records/components/TourActions";
import { tourOperatorNames } from "@/features/contacts/logic";

export default async function ToursPage({ searchParams }: { searchParams: Promise<{ date?: string | string[]; ocultos?: string | string[] }> }) {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id,full_name").eq("id", user.id).single();
  const today = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  // Default view: tours taking place today. ?date= shows another day; nothing is deleted.
  const query = await searchParams;
  const day = selectedTourDay(query.date, today);
  // Hidden tours (cancelled, then "Ocultar") are left out unless ?ocultos=1.
  const showHidden = (Array.isArray(query.ocultos) ? query.ocultos[0] : query.ocultos) === "1";
  const isToday = day === today;
  const dayLabel = `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
  const columns = "id,guest_name,room_number,operator_name,tour_name,tour_date,adults,children,total_price,currency,commission_amount,status,payment_method,booked_by";
  const baseQuery = () => supabase.from("tour_bookings").select(`${columns},hidden`).eq("hotel_id", profile?.hotel_id ?? "").eq("tour_date", day).order("created_at", { ascending: false });
  const visible = await (showHidden ? baseQuery() : baseQuery().eq("hidden", false));
  // Before migration 0030 there is no hidden column: list everything and say so.
  const hiddenMissing = visible.error?.code === "42703";
  const tours = hiddenMissing
    ? ((await supabase.from("tour_bookings").select(columns).eq("hotel_id", profile?.hotel_id ?? "").eq("tour_date", day).order("created_at", { ascending: false })).data ?? []).map((tour) => ({ ...tour, hidden: false }))
    : visible.data ?? [];
  const toggleHref = `/tours?date=${day}${showHidden ? "" : "&ocultos=1"}`;
  const contacts = await getContacts();
  const operators = tourOperatorNames(contacts);
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">TOURS</p><h1>{es ? "Tours reservados" : "Booked tours"}</h1><p>{es ? `Tours con fecha ${isToday ? "de hoy" : "del"} ${dayLabel}. Todos los registros se guardan en YuliOS y quedan en cola para Google Sheets.` : `Tours taking place ${isToday ? "today, " : "on "}${dayLabel}. Every entry is saved in YuliOS and queued for Google Sheets.`}</p><form className="report-selector tour-day-selector" action="/tours"><label>{es ? "Fecha del tour" : "Tour date"}<input name="date" type="date" defaultValue={day} required /></label>{showHidden && <input type="hidden" name="ocultos" value="1" />}<button className="secondary-button">{es ? "Ver" : "Show"}</button>{!isToday && <a className="secondary-button" href={showHidden ? "/tours?ocultos=1" : "/tours"}>{es ? "Hoy" : "Today"}</a>}<a className={`secondary-button hidden-toggle${showHidden ? " active" : ""}`} href={toggleHref}>{showHidden ? (es ? "✓ Mostrando cancelados/ocultos" : "✓ Showing cancelled/hidden") : (es ? "Mostrar cancelados/ocultos" : "Show cancelled/hidden")}</a></form>{hiddenMissing && <p className="form-note">{es ? "Para poder ocultar tours cancelados, ejecute la migración 0030 en Supabase." : "To hide cancelled tours, run migration 0030 in Supabase."}</p>}</div><RegisterButton kind="tour" locale={locale} defaultBookedBy={profile?.full_name ?? ""} /></div><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Huésped" : "Guest"}</th><th>{es ? "Habitación" : "Room"}</th><th>{es ? "Operador" : "Operator"}</th><th>Tour</th><th>{es ? "Fecha" : "Date"}</th><th>Pax</th><th>Total</th><th>{es ? "Comisión" : "Commission"}</th><th>{es ? "Reservado por" : "Booked by"}</th><th>{es ? "Estado" : "Status"}</th><th>WhatsApp</th><th>{es ? "Acciones" : "Actions"}</th></tr></thead><tbody>{tours.length ? tours.map((tour) => <tr key={tour.id} className={tour.hidden ? "tour-hidden" : undefined}><td>{tour.guest_name}</td><td>{tour.room_number ?? "—"}</td><td>{tour.operator_name}</td><td>{tour.tour_name}</td><td>{tour.tour_date}</td><td>{tour.adults + tour.children}</td><td>{tour.currency} {Number(tour.total_price).toFixed(2)}</td><td>{tour.currency} {Number(tour.commission_amount).toFixed(2)}</td><td>{tour.booked_by}</td><td>{tour.hidden ? <span className="state-pill state-cancelled">{es ? "Cancelado · Oculto" : "Cancelled · Hidden"}</span> : <TourStatusEditor id={tour.id} status={tour.status as "pending" | "paid" | "cancelled"} locale={locale} />}</td><td><SupplierMessage contacts={contacts} operator={tour.operator_name} locale={locale} text={`Hotel Yuli — ${es ? "Reserva de tour" : "Tour booking"}
${tour.operator_name}
${tour.tour_name} · ${tour.tour_date}
${es ? "Huésped" : "Guest"}: ${tour.guest_name}
${es ? "Habitación" : "Room"}: ${tour.room_number ?? "—"}
${es ? "Adultos / Niños" : "Adults / Children"}: ${tour.adults} / ${tour.children}
Total: ${tour.currency} ${tour.total_price}`} /></td><td><TourActions tour={tour as EditableTour} hidden={tour.hidden} operators={operators} locale={locale} /></td></tr>) : <tr><td colSpan={12} className="empty-table-cell">{isToday ? (es ? "No hay tours para hoy." : "No tours for today.") : (es ? `No hay tours para el ${dayLabel}.` : `No tours on ${dayLabel}.`)}</td></tr>}</tbody></table></div></main>;
}
