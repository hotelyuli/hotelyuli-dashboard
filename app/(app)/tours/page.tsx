import { getContacts } from "@/features/contacts/actions";
import { SupplierMessage } from "@/features/contacts/SupplierMessage";
import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import type { Locale } from "@/lib/i18n";

export default async function ToursPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id,full_name").eq("id", user.id).single();
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { data: tours } = await supabase.from("tour_bookings").select("id,guest_name,room_number,operator_name,tour_name,tour_date,adults,children,total_price,currency,commission_amount,status,payment_method,booked_by").eq("hotel_id", profile?.hotel_id ?? "").eq("operation_date", operationDate).order("created_at", { ascending: false });
  const contacts = await getContacts();
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">TOURS</p><h1>{es ? "Tours reservados" : "Booked tours"}</h1><p>{es ? "Cada registro se guarda en YuliOS y queda en cola para Google Sheets." : "Each entry is saved in YuliOS and queued for Google Sheets."}</p></div><RegisterButton kind="tour" locale={locale} defaultBookedBy={profile?.full_name ?? ""} /></div><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Huésped" : "Guest"}</th><th>{es ? "Habitación" : "Room"}</th><th>{es ? "Operador" : "Operator"}</th><th>Tour</th><th>{es ? "Fecha" : "Date"}</th><th>Pax</th><th>Total</th><th>{es ? "Comisión" : "Commission"}</th><th>{es ? "Reservado por" : "Booked by"}</th><th>WhatsApp</th></tr></thead><tbody>{tours?.length ? tours.map((tour) => <tr key={tour.id}><td>{tour.guest_name}</td><td>{tour.room_number ?? "—"}</td><td>{tour.operator_name}</td><td>{tour.tour_name}</td><td>{tour.tour_date}</td><td>{tour.adults + tour.children}</td><td>{tour.currency} {Number(tour.total_price).toFixed(2)}</td><td>{tour.currency} {Number(tour.commission_amount).toFixed(2)}</td><td>{tour.booked_by}</td><td><SupplierMessage contacts={contacts} operator={tour.operator_name} locale={locale} text={`Hotel Yuli — ${es ? "Reserva de tour" : "Tour booking"}
${tour.operator_name}
${tour.tour_name} · ${tour.tour_date}
${es ? "Huésped" : "Guest"}: ${tour.guest_name}
${es ? "Habitación" : "Room"}: ${tour.room_number ?? "—"}
${es ? "Adultos / Niños" : "Adults / Children"}: ${tour.adults} / ${tour.children}
Total: ${tour.currency} ${tour.total_price}`} /></td></tr>) : <tr><td colSpan={10} className="empty-table-cell">{es ? "Todavía no hay tours registrados hoy." : "No tours have been registered today."}</td></tr>}</tbody></table></div></main>;
}
