import { BedDouble, CalendarCheck, CircleDollarSign, ClipboardCheck, Coffee, Waves, BrushCleaning, LockKeyhole } from "lucide-react";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import Link from "next/link";
import { cookies } from "next/headers";
import { dictionary, type Locale } from "@/lib/i18n";
import { CsvImportPanel } from "@/features/csv-import/components/CsvImportPanel";
import { requireSession } from "@/features/auth/logic/guards";
import { formatInTimeZone } from "date-fns-tz";
import {
  RoomBoardTable,
  type BoardRow,
  type RoomOption
} from "@/features/operations/components/RoomBoardTable";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const t = dictionary(locale);
  const es = locale === "es";
  const shift = (await cookies()).get("yulios-shift")?.value === "afternoon" ? "afternoon" : "morning";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id, full_name").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");

  const [{ count: checkIns }, { count: checkOuts }, { data: operations }, { data: rooms }, { data: tasks, count: taskCount, error: taskError }, { data: events, error: eventError }, { count: tourCount, error: tourError }] = await Promise.all([
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("hotel_id", hotelId).eq("arrival_date", operationDate),
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("hotel_id", hotelId).eq("departure_date", operationDate),
    supabase
      .from("daily_operations")
      .select(
        "id, room_id, guest_name, adults, children, babies, total_pax, departure_date, operational_status, breakfast_status, breakfast_pax, breakfast_to_go, breakfast_notes, payment_status, payment_method, outstanding_balance, currency, car_plate, booking_channel, notes, housekeeping_category, same_day_arrival"
      )
      .eq("hotel_id", hotelId)
      .eq("operation_date", operationDate),
    supabase
      .from("rooms")
      .select("id, display_name, sort_order, active")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase.from("tasks").select("id, title, room_area, priority, status, assigned_to", { count: "exact" })
      .eq("hotel_id", hotelId).in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false }).limit(5),
    supabase.from("shift_events").select("id,event_time,room_area,description,status").eq("hotel_id", hotelId).eq("operation_date", operationDate).order("event_time", { ascending: false }).limit(4),
    supabase.from("tour_bookings").select("id", { count: "exact", head: true }).eq("hotel_id", hotelId).eq("tour_date", operationDate).neq("status", "cancelled")
  ]);

  if (taskError || eventError || tourError) throw new Error("TASKS_LOAD_FAILED");
  const rows = operations ?? [];
  const stayThrough = rows.filter((row) => row.operational_status === "staying").length;

  const breakfastCovers = rows.filter((row) => row.breakfast_status === "included").reduce((sum, row) => sum + row.breakfast_pax, 0);
  const pending = rows.filter((row) => (row.outstanding_balance ?? 0) > 0);
  const pendingUsd = pending.filter((row) => row.currency === "USD").reduce((sum, row) => sum + (row.outstanding_balance ?? 0), 0);
  const pendingCrc = pending.filter((row) => row.currency === "CRC").reduce((sum, row) => sum + (row.outstanding_balance ?? 0), 0);
  const opsByRoom = new Map(rows.map((row) => [row.room_id, row]));
  const roomOptions: RoomOption[] = (rooms ?? []).map((room) => ({ id: room.id, displayName: room.display_name }));
  const boardRows: BoardRow[] = (rooms ?? []).map((room) => {
    const operation = opsByRoom.get(room.id);
    return {
      rowId: operation?.id ?? null,
      roomId: room.id,
      roomLabel: room.display_name,
      guestName: operation?.guest_name ?? null,
      adults: operation?.adults ?? 0,
      children: operation?.children ?? 0,
      babies: operation?.babies ?? 0,
      totalPax: operation?.total_pax ?? 0,
      departureDate: operation?.departure_date ?? null,
      operationalStatus: operation?.operational_status ?? (room.active ? "available" : "out_of_service"),
      breakfastStatus: operation?.breakfast_status ?? "not_included",
      breakfastPax: operation?.breakfast_pax ?? 0,
      breakfastToGo: operation?.breakfast_to_go ?? false,
      breakfastNotes: operation?.breakfast_notes ?? null,
      paymentStatus: operation?.payment_status ?? null,
      paymentMethod: operation?.payment_method ?? null,
      outstandingBalance: operation?.outstanding_balance ?? null,
      currency: operation?.currency ?? null,
      carPlate: operation?.car_plate ?? null,
      bookingChannel: operation?.booking_channel ?? null,
      notes: operation?.notes ?? null,
      housekeepingCategory: operation?.housekeeping_category ?? null,
      sameDayArrival: operation?.same_day_arrival ?? false
    };
  });

  const available = boardRows.filter(row => row.operationalStatus === "available").length;
  const occupied = boardRows.filter(row => row.operationalStatus === "staying" || row.operationalStatus === "check_in").length;
  const capacity = boardRows.filter(row => row.operationalStatus !== "out_of_service").length;
  const occupancy = capacity ? Math.round(100 * occupied / capacity) : 0;
  const cards = [
    { label: t.checkIns, value: checkIns ?? 0, note: es ? "llegadas de hoy" : "arrivals today", icon: CalendarCheck },
    { label: t.checkOuts, value: checkOuts ?? 0, note: es ? "salidas de hoy" : "departures today", icon: BedDouble },
    { label: t.kpiStayThrough, value: stayThrough, note: es ? "huéspedes alojados" : "in-house stays", icon: BedDouble },
    { label: t.kpiAvailable, value: available, note: es ? "unidades libres" : "available units", icon: BedDouble },
    { label: t.breakfasts, value: breakfastCovers, note: t.includedCovers, icon: Coffee },
    { label: t.pendingPayments, value: pending.length, note: `USD ${pendingUsd.toFixed(2)} · CRC ${pendingCrc.toFixed(2)}`, icon: CircleDollarSign },
    { label: t.openTasks, value: taskCount ?? 0, note: t.activeFollowups, icon: ClipboardCheck },
    { label: es ? "Tours de hoy" : "Today's tours", value: tourCount ?? 0, note: es ? "reservas de tours" : "tour bookings", icon: Waves }
  ];
  return (
    <main className="reception-dashboard">
      <section className="reception-imports"><div className="section-caption"><h2>{es ? "Importación de datos" : "Data import"}</h2><span>LITTLE HOTELIER · CSV</span></div><CsvImportPanel locale={locale} variant="cards" /></section>
      <div className="reception-toolbar"><div className="section-caption"><h2>{es ? "Acciones de turno" : "Shift actions"}</h2><span>{es ? "ACCESOS RÁPIDOS" : "QUICK ACTIONS"}</span></div>
        <RegisterButton kind="event" locale={locale} />
        <Link className="secondary-button" href="/breakfast"><Coffee size={17} aria-hidden="true" />{es ? "Reporte de desayuno" : "Breakfast report"}</Link>
        <Link className="secondary-button" href="/housekeeping"><BrushCleaning size={17} aria-hidden="true" />{es ? "Lista de limpieza" : "Housekeeping list"}</Link>
        <RegisterButton kind="tour" locale={locale} defaultBookedBy={profile?.full_name ?? ""} />
        <RegisterButton kind="income" locale={locale} />
        <Link className="primary-button close-shift-link" href={`/reports?shift=${shift}`}><LockKeyhole size={17} aria-hidden="true" />{es ? "Cerrar turno" : "Close shift"}</Link>
      </div>
      <div className="reception-columns">
        <div className="reception-main">
          <section className="reception-kpis" aria-label={es ? "Indicadores del día" : "Today's overview"}>
            {cards.map(({ label, value, note, icon: Icon }) => <article className="metric-card" key={label}><span>{label}</span><Icon size={17} aria-hidden="true" /><strong>{value}</strong><small>{note}</small></article>)}
          </section>
          <div className="occupancy-bar"><span>{es ? "Ocupación de hoy" : "Today's occupancy"}: <strong>{occupied}/{capacity} · {occupancy}%</strong></span><progress value={occupancy} max={100} aria-label={es ? "Ocupación" : "Occupancy"} /></div>
          <section className="reception-panel" aria-labelledby="room-board-title"><div className="panel-title"><h2 id="room-board-title">{t.operationsTitle}</h2><span className="count-pill">{boardRows.length} {es ? "unidades" : "units"}</span></div><RoomBoardTable rows={boardRows} rooms={roomOptions} locale={locale} /></section>
          <section className="reception-panel"><div className="panel-title"><h2>{t.pendingPayments}</h2></div><div className="pending-totals"><strong>USD {pendingUsd.toFixed(2)}</strong><strong>CRC {pendingCrc.toFixed(2)}</strong></div><p className="panel-note">{es ? "USD y CRC se mantienen separados." : "USD and CRC are kept separate."}</p></section>
        </div>
        <aside className="reception-sidebar">
          <section className="reception-panel"><div className="panel-title"><h2>{es ? "Eventos de hoy" : "Today's events"}</h2><Link href="/events">{es ? "Ver todos" : "View all"}</Link></div>
            {events?.length ? events.map(event => <article className="sidebar-entry" key={event.id}><time>{event.event_time.slice(0,5)}</time><div><small>{event.room_area ?? (es ? "Recepción" : "Reception")}</small><p>{event.description}</p><span className="count-pill">{event.status === "completed" ? (es ? "Completado" : "Completed") : event.status === "temporary_solution" ? (es ? "Solución temporal" : "Temporary solution") : (es ? "Seguimiento" : "Follow-up")}</span></div></article>) : <p className="panel-note">{es ? "Sin eventos registrados hoy." : "No events recorded today."}</p>}
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
