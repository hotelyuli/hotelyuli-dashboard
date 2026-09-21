import { BedDouble, CalendarCheck, CircleDollarSign, ClipboardCheck, Coffee, Wrench } from "lucide-react";
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
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");

  const [{ count: checkIns }, { count: checkOuts }, { data: operations }, { data: rooms }, { data: tasks, count: taskCount, error: taskError }] = await Promise.all([
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
      .order("created_at", { ascending: false }).limit(5)
  ]);

  if (taskError) throw new Error("TASKS_LOAD_FAILED");
  const rows = operations ?? [];
  const stayThrough = rows.filter((row) => row.operational_status === "staying").length;
  const available = rows.filter((row) => row.operational_status === "available").length;
  const outOfService = rows.filter((row) => row.operational_status === "out_of_service").length;
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

  const cards = [
    { label: t.checkIns, value: (checkIns ?? 0).toString(), note: t.importToday, icon: CalendarCheck },
    { label: t.checkOuts, value: (checkOuts ?? 0).toString(), note: t.importToday, icon: BedDouble },
    { label: t.kpiStayThrough, value: stayThrough.toString(), note: t.kpiAvailable + `: ${available}`, icon: BedDouble },
    { label: t.breakfasts, value: breakfastCovers.toString(), note: t.includedCovers, icon: Coffee },
    { label: t.pendingPayments, value: pending.length.toString(), note: `USD ${pendingUsd.toFixed(2)} · CRC ${pendingCrc.toFixed(2)}`, icon: CircleDollarSign },
    { label: t.openTasks, value: (taskCount ?? 0).toString(), note: t.activeFollowups, icon: ClipboardCheck },
    { label: t.maintenance, value: outOfService.toString(), note: t.pending, icon: Wrench }
  ];
  return (
    <main className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">{t.morning}</p><h1>{t.greeting}</h1><p>{t.dayStarts}</p></div><CsvImportPanel locale={locale} /></div>
      <section className="metric-grid" aria-label="Indicadores del día">
        {cards.map(({ label, value, note, icon: Icon }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
      </section>
      <section className="dashboard-board" aria-labelledby="dashboard-tasks-title">
        <div className="section-heading">
          <h2 id="dashboard-tasks-title">{t.openTasks} · {taskCount ?? 0}</h2>
          <Link className="secondary-button" href="/tasks">{locale === "es" ? "Ver todas las tareas" : "View all tasks"}</Link>
        </div>
        {tasks?.length ? <div className="board-table-wrap"><table className="board-table">
          <thead><tr><th>{locale === "es" ? "Tarea" : "Task"}</th><th>{locale === "es" ? "Habitación / Área" : "Room / Area"}</th><th>{locale === "es" ? "Estado" : "Status"}</th><th>{locale === "es" ? "Responsable" : "Assigned to"}</th></tr></thead>
          <tbody>{tasks.map(task => <tr key={task.id}>
            <td className="notes-cell"><Link href="/tasks">{task.title}</Link></td>
            <td>{task.room_area ?? "—"}</td>
            <td>{task.status === "in_progress" ? (locale === "es" ? "En progreso" : "In progress") : (locale === "es" ? "Pendiente" : "Open")}</td>
            <td>{task.assigned_to ?? "—"}</td>
          </tr>)}</tbody>
        </table></div> : <p>{locale === "es" ? "No hay tareas abiertas." : "There are no open tasks."}</p>}
      </section>
      <section className="dashboard-board" aria-labelledby="room-board-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t.operations.toUpperCase()}</p>
            <h2 id="room-board-title">{t.operationsTitle}</h2>
          </div>
          <span>{boardRows.length} {locale === "es" ? "unidades" : "units"}</span>
        </div>
        <RoomBoardTable rows={boardRows} rooms={roomOptions} locale={locale} />
      </section>
    </main>
  );
}
