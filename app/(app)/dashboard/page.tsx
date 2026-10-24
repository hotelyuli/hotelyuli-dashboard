import { BedDouble, CalendarCheck, CircleDollarSign, ClipboardCheck, Coffee, Waves } from "lucide-react";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import { NotificationsBanner } from "@/components/NotificationsButton";
import Link from "next/link";
import { cookies } from "next/headers";
import { dictionary, type Locale } from "@/lib/i18n";
import { CsvImportPanel } from "@/features/csv-import/components/CsvImportPanel";
import { requireSession } from "@/features/auth/logic/guards";
import { formatInTimeZone } from "date-fns-tz";
import {
  RoomBoardTable,
  type RoomOption
} from "@/features/operations/components/RoomBoardTable";
import { settledTotals } from "@/features/records/logic/settlement";
import { boardToursFilter, toursByUnit } from "@/features/operations/logic/board-tours";
import { BOARD_OPERATION_COLUMNS, boardOccupancy, buildBoardRows, pendingBalances } from "@/features/operations/logic/board-rows";
import { inactiveReservations, withActiveReservations } from "@/features/operations/services/active-reservations";
import { reservationReferences } from "@/features/operations/services/reservation-references";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const t = dictionary(locale);
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");

  const [{ count: checkIns }, { count: checkOuts }, { data: operations }, { data: rooms }, { data: tasks, count: taskCount, error: taskError }, { data: events, error: eventError }, { data: tours, error: tourError }, { data: income }, { data: boardTourBookings }] = await Promise.all([
    // Room units (one reservation row per room / Room 20 bed) arriving / leaving today, active reservations only.
    withActiveReservations((table) => supabase.from(table).select("id", { count: "exact", head: true }).eq("hotel_id", hotelId).eq("arrival_date", operationDate)),
    withActiveReservations((table) => supabase.from(table).select("id", { count: "exact", head: true }).eq("hotel_id", hotelId).eq("departure_date", operationDate)),
    supabase
      .from("daily_operations")
      .select(BOARD_OPERATION_COLUMNS)
      .eq("hotel_id", hotelId)
      .eq("operation_date", operationDate),
    supabase
      .from("rooms")
      .select("id, display_name, room_number, sort_order, active, unit_code, unit_type")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase.from("tasks").select("id, title, room_area, priority, status, assigned_to", { count: "exact" })
      .eq("hotel_id", hotelId).in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false }).limit(5),
    supabase.from("shift_events").select("id,event_time,room_area,description,status").eq("hotel_id", hotelId).eq("operation_date", operationDate).order("event_time", { ascending: false }).limit(4),
    supabase.from("tour_bookings").select("status").eq("hotel_id", hotelId).eq("tour_date", operationDate).neq("status", "cancelled"),
    supabase.from("income_entries").select("amount, currency, paid, entry_type").eq("hotel_id", hotelId).eq("operation_date", operationDate),
    supabase.from("tour_bookings").select("id, room_number, guest_name, tour_name, tour_date, operation_date, status").eq("hotel_id", hotelId).neq("status", "cancelled").or(boardToursFilter(operationDate))
  ]);

  if (taskError || eventError || tourError) throw new Error("TASKS_LOAD_FAILED");
  const tourCount = tours?.length ?? 0;
  const paidTourCount = (tours ?? []).filter((tour) => tour.status === "paid").length;
  const incomeToday = settledTotals((income ?? []).map((entry) => ({ amount: entry.amount, currency: entry.currency, paid: entry.paid, entryType: entry.entry_type })));
  const rows = operations ?? [];
  const opsByRoom = new Map(rows.map((row) => [row.room_id, row]));
  const roomOptions: RoomOption[] = (rooms ?? []).map((room) => ({ id: room.id, displayName: room.display_name }));
  const toursForUnit = toursByUnit(boardTourBookings ?? [], operationDate, new Map((rooms ?? []).map((room) => [room.unit_code, opsByRoom.get(room.id)?.guest_name ?? null])));
  const references = await reservationReferences(supabase, hotelId, rows.map((row) => row.reservation_id));
  // Shared selector: rows of reservations that no longer count are free rooms in every KPI below.
  const inactive = await inactiveReservations(supabase, hotelId, rows.map((row) => row.reservation_id));
  const boardRows = buildBoardRows({ rooms: rooms ?? [], operations: rows, references, toursForUnit, inactive, es });
  const stayThrough = boardRows.filter((row) => row.operationalStatus === "staying").length;
  // Each booking's balance once (a booking over several rooms repeats it on every row).
  const { USD: pendingUsd, CRC: pendingCrc, bookings: pendingBookings } = pendingBalances(boardRows);

  // Each booking's covers once (a booking over several rooms or beds is not counted per room).
  const breakfastCovers = boardRows.reduce((sum, row) => sum + row.countedBreakfastPax, 0);
  const { available, occupied, capacity, percent: occupancy } = boardOccupancy(boardRows);
  const cards = [
    { label: t.checkIns, value: checkIns ?? 0, note: es ? "llegadas de hoy" : "arrivals today", icon: CalendarCheck },
    { label: t.checkOuts, value: checkOuts ?? 0, note: es ? "salidas de hoy" : "departures today", icon: BedDouble },
    { label: t.kpiStayThrough, value: stayThrough, note: es ? "huéspedes alojados" : "in-house stays", icon: BedDouble },
    { label: t.kpiAvailable, value: available, note: es ? "unidades libres" : "available units", icon: BedDouble },
    { label: t.breakfasts, value: breakfastCovers, note: t.includedCovers, icon: Coffee },
    // Border rule: only cards that need action today get the terracotta accent.
    { label: t.pendingPayments, value: pendingBookings, note: `USD ${pendingUsd.toFixed(2)} · CRC ${pendingCrc.toFixed(2)}`, icon: CircleDollarSign, attention: pendingBookings > 0 },
    { label: t.openTasks, value: taskCount ?? 0, note: t.activeFollowups, icon: ClipboardCheck, attention: (taskCount ?? 0) > 0 },
    { label: es ? "Tours de hoy" : "Today's tours", value: tourCount, note: es ? `${paidTourCount} pagados` : `${paidTourCount} paid`, icon: Waves }
  ];
  return (
    <main className="reception-dashboard">
      <NotificationsBanner locale={locale} />
      <section className="reception-imports" aria-label={es ? "Importación de datos" : "Data import"}><CsvImportPanel locale={locale} variant="bar" /></section>
      <div className="reception-columns">
        <div className="reception-main">
          <section className="reception-kpis" aria-label={es ? "Indicadores del día" : "Today's overview"}>
            {cards.map(({ label, value, note, icon: Icon, attention }) => <article className={`metric-card${attention ? " needs-attention" : ""}`} key={label}><span>{label}</span><Icon size={17} aria-hidden="true" /><strong>{value}</strong><small>{note}</small></article>)}
          </section>
          <section className="occupancy-bar" aria-label={es ? "Ocupación de hoy" : "Today's occupancy"}>
            <div className="occupancy-head">
              <div><small>{es ? "OCUPACIÓN DE HOY" : "TODAY'S OCCUPANCY"}</small><p><strong>{occupied}</strong> {es ? `de ${capacity} unidades ocupadas` : `of ${capacity} units occupied`}</p></div>
              <strong className="occupancy-percent">{occupancy}%</strong>
            </div>
            <div className="occupancy-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={occupancy} aria-label={es ? "Ocupación" : "Occupancy"}><span style={{ width: `${occupancy}%` }} /></div>
          </section>
          <section className="reception-panel" aria-labelledby="room-board-title"><div className="panel-title"><h2 id="room-board-title">{t.operationsTitle}</h2><span className="count-pill">{boardRows.length} {es ? "unidades" : "units"}</span></div><RoomBoardTable rows={boardRows} rooms={roomOptions} locale={locale} /></section>
          <section className="reception-panel"><div className="panel-title"><h2>{es ? "Ingresos de hoy" : "Today's income"}</h2><Link href="/income">{es ? "Ver ingresos" : "View income"}</Link></div><div className="pending-totals"><strong>USD {incomeToday.USD.toFixed(2)}</strong><strong>CRC {incomeToday.CRC.toFixed(2)}</strong></div><p className="panel-note">{es ? "Solo lo cobrado, incluidas comisiones de tours pagados; los reversos restan." : "Settled money only, including paid tour commissions; reversals subtract."}</p></section>
          <section className="reception-panel"><div className="panel-title"><h2>{t.pendingPayments}</h2></div><div className="pending-totals"><strong>USD {pendingUsd.toFixed(2)}</strong><strong>CRC {pendingCrc.toFixed(2)}</strong></div><p className="panel-note">{es ? "USD y CRC se mantienen separados." : "USD and CRC are kept separate."}</p></section>
        </div>
        <aside className="reception-sidebar">
          <section className="reception-panel"><div className="panel-title"><h2>{es ? "Incidentes de hoy" : "Today's incidents"}</h2><Link href="/events">{es ? "Ver todos" : "View all"}</Link></div>
            {events?.length ? events.map(event => <article className="sidebar-entry" key={event.id}><time>{event.event_time.slice(0,5)}</time><div><small>{event.room_area ?? (es ? "Recepción" : "Reception")}</small><p>{event.description}</p><span className="count-pill">{event.status === "completed" ? (es ? "Completado" : "Completed") : event.status === "temporary_solution" ? (es ? "Solución temporal" : "Temporary solution") : (es ? "Seguimiento" : "Follow-up")}</span></div></article>) : <p className="panel-note">{es ? "Sin incidentes registrados hoy." : "No incidents recorded today."}</p>}
            <div className="panel-footer"><RegisterButton kind="event" locale={locale} /></div>
          </section>
          <section className="reception-panel"><div className="panel-title"><h2>{t.openTasks}</h2><span className="count-pill">{taskCount ?? 0}</span></div>
            {tasks?.length ? tasks.map(task => <article className={`sidebar-task priority-${task.priority}`} key={task.id}><small>{task.room_area ?? "—"}</small><p>{task.title}</p>{task.assigned_to && <small>{es ? "Responsable" : "Assigned"}: {task.assigned_to}</small>}<span className="count-pill">{task.status === "in_progress" ? (es ? "En progreso" : "In progress") : (es ? "Pendiente" : "Open")}</span></article>) : <p className="panel-note">{es ? "No hay tareas abiertas." : "No open tasks."}</p>}
            <div className="panel-footer"><Link className="secondary-button" href="/tasks">{es ? "Ver todas las tareas" : "View all tasks"}</Link></div>
          </section>
        </aside>
      </div>
    </main>
  );
}
