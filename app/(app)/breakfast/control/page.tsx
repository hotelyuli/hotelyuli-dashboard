import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { loadBreakfastControl } from "@/features/operations/services/breakfast-control-data";
import { BreakfastControlActions } from "@/features/operations/components/BreakfastControlActions";
import { selectedTourDay } from "@/features/records/logic/tour-day";
import { addDays, controlDateLabel, formatBreakfastControl, formatBreakfastControlWhatsApp } from "@/features/operations/logic/breakfast-control";
import Link from "next/link";
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
  const { summary, pending } = await loadBreakfastControl(supabase, hotelId, day);
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
        <BreakfastControlActions targetId="breakfast-control-card" date={day} text={message} whatsappText={formatBreakfastControlWhatsApp({ date: day, summary })} locale={locale} />
      </div>
      {pending.length > 0 && (
        <section className="message-summary split-pending" aria-label={es ? "Reparto de pax pendiente" : "Pax split pending"}>
          <h2>{es ? "Reservas en varias habitaciones: reparto pendiente" : "Bookings over several rooms: split pending"}</h2>
          <p>{es ? "Mientras no se repartan, el total cuenta los pax de la reserva una vez (en su primera habitación). Se reparten en Operaciones (Room board), botón «Repartir pax»." : "Until split, the total counts the booking's pax once (on its first room). Split them in Operations (Room board), \"Split pax\" button."}</p>
          <ul>
            {pending.map((item) => (
              <li key={item.reservationId}>
                <strong>{item.reference}</strong> · {item.guest ?? "—"} · {item.pax} pax · {es ? "hab." : "rooms"} {item.rooms.join(" + ")}{item.resplit ? (es ? " · la reserva cambió" : " · booking changed") : ""}{" "}
                <Link className="secondary-button split-pax-button" href="/operations">{es ? "Repartir en Operaciones" : "Split in Operations"}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <BreakfastControlCard id="breakfast-control-card" date={day} generatedAt={new Date()} summary={summary} />
      <section className="message-summary"><h2>{es ? "Lista para WhatsApp" : "WhatsApp summary"}</h2><pre>{message}</pre></section>
    </main>
  );
}
