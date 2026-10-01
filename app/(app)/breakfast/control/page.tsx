import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { MessageActions } from "@/features/reports/components/MessageActions";
import { DownloadPdfButton } from "@/features/reports/components/DownloadPdfButton";
import { selectedTourDay } from "@/features/records/logic/tour-day";
import { addDays, controlDateLabel, controlEntries, formatBreakfastControl, freeRooms, summarizeBreakfastControl, type ControlDayRow } from "@/features/operations/logic/breakfast-control";
import { BreakfastControlCard } from "@/features/operations/components/BreakfastControlCard";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Control de desayunos" };

export default async function BreakfastControlPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  // Sent the day before: defaults to tomorrow in the hotel's timezone; ?date= picks another day.
  const tomorrow = addDays(formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd"), 1);
  const day = selectedTourDay((await searchParams).date, tomorrow);
  const previousDay = addDays(day, -1);

  const [{ data: rooms }, { data: reservations }, { data: operations }] = await Promise.all([
    supabase.from("rooms").select("id, room_number, unit_type, parent_room_number, sort_order, active").eq("hotel_id", hotelId),
    supabase.from("reservations").select("id, room_id, guest_name, arrival_date, departure_date, adults, children, babies, notes").eq("hotel_id", hotelId).lt("arrival_date", day).gte("departure_date", day),
    supabase.from("daily_operations").select("operation_date, room_id, reservation_id, breakfast_status, breakfast_pax, breakfast_to_go, breakfast_to_go_time, breakfast_notes").eq("hotel_id", hotelId).in("operation_date", [previousDay, day])
  ]);

  const units = (rooms ?? []).map((room) => ({ roomId: room.id, roomNumber: room.room_number, unitType: room.unit_type, parentRoomNumber: room.parent_room_number, sortOrder: room.sort_order, active: room.active }));
  const toDayRow = (row: NonNullable<typeof operations>[number]): ControlDayRow => ({ roomId: row.room_id, reservationId: row.reservation_id, breakfastStatus: row.breakfast_status, breakfastPax: row.breakfast_pax, breakfastToGo: row.breakfast_to_go, breakfastToGoTime: row.breakfast_to_go_time, breakfastNotes: row.breakfast_notes });
  const entries = controlEntries({
    date: day,
    units,
    reservations: (reservations ?? []).map((r) => ({ id: r.id, roomId: r.room_id, guestName: r.guest_name, arrivalDate: r.arrival_date, departureDate: r.departure_date, adults: r.adults, children: r.children, babies: r.babies, notes: r.notes })),
    dayRows: (operations ?? []).filter((row) => row.operation_date === day).map(toDayRow),
    previousDayRows: (operations ?? []).filter((row) => row.operation_date === previousDay).map(toDayRow)
  });
  const summary = summarizeBreakfastControl({ entries, free: freeRooms(units, entries) });
  const message = formatBreakfastControl({ date: day, summary });

  return (
    <main className="dashboard-page breakfast-control-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{es ? "RESTAURANTE" : "RESTAURANT"}</p>
          <h1>{es ? "Control de desayunos" : "Breakfast control"}</h1>
          <p>{es ? `Lista para el desayuno del ${controlDateLabel(day)}.` : `List for breakfast on ${controlDateLabel(day)}.`}</p>
          <form className="report-selector" action="/breakfast/control">
            <label>{es ? "Fecha del desayuno" : "Breakfast date"}<input name="date" type="date" defaultValue={day} required /></label>
            <button className="secondary-button">{es ? "Ver" : "Show"}</button>
            {day !== tomorrow && <a className="secondary-button" href="/breakfast/control">{es ? "Mañana" : "Tomorrow"}</a>}
          </form>
        </div>
        <div className="message-actions">
          <MessageActions text={message} locale={locale} />
          <DownloadPdfButton targetId="breakfast-control-card" fileName={`control-desayunos-${day}.pdf`} locale={locale} />
        </div>
      </div>
      <BreakfastControlCard date={day} summary={summary} locale={locale} />
      <section className="message-summary"><h2>{es ? "Lista para WhatsApp" : "WhatsApp summary"}</h2><pre>{message}</pre></section>
    </main>
  );
}
