import { BedDouble, CalendarCheck, CircleDollarSign, ClipboardCheck, Coffee, Wrench } from "lucide-react";
import { cookies } from "next/headers";
import { dictionary, type Locale } from "@/lib/i18n";
import { CsvImportPanel } from "@/features/csv-import/components/CsvImportPanel";
import { requireSession } from "@/features/auth/logic/guards";
import { formatInTimeZone } from "date-fns-tz";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const t = dictionary(locale);
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const hotelId = profile?.hotel_id ?? "";
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");

  const [{ count: checkIns }, { count: checkOuts }, { data: operations }] = await Promise.all([
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("hotel_id", hotelId).eq("arrival_date", operationDate),
    supabase.from("reservations").select("id", { count: "exact", head: true }).eq("hotel_id", hotelId).eq("departure_date", operationDate),
    supabase
      .from("daily_operations")
      .select("operational_status, breakfast_status, breakfast_pax, outstanding_balance, currency")
      .eq("hotel_id", hotelId)
      .eq("operation_date", operationDate)
  ]);

  const rows = operations ?? [];
  const stayThrough = rows.filter((row) => row.operational_status === "staying").length;
  const available = rows.filter((row) => row.operational_status === "available").length;
  const outOfService = rows.filter((row) => row.operational_status === "out_of_service").length;
  const breakfastCovers = rows.filter((row) => row.breakfast_status === "included").reduce((sum, row) => sum + row.breakfast_pax, 0);
  const pending = rows.filter((row) => (row.outstanding_balance ?? 0) > 0);
  const pendingUsd = pending.filter((row) => row.currency === "USD").reduce((sum, row) => sum + (row.outstanding_balance ?? 0), 0);
  const pendingCrc = pending.filter((row) => row.currency === "CRC").reduce((sum, row) => sum + (row.outstanding_balance ?? 0), 0);

  const cards = [
    { label: t.checkIns, value: (checkIns ?? 0).toString(), note: t.importToday, icon: CalendarCheck },
    { label: t.checkOuts, value: (checkOuts ?? 0).toString(), note: t.importToday, icon: BedDouble },
    { label: t.kpiStayThrough, value: stayThrough.toString(), note: t.kpiAvailable + `: ${available}`, icon: BedDouble },
    { label: t.breakfasts, value: breakfastCovers.toString(), note: t.includedCovers, icon: Coffee },
    { label: t.pendingPayments, value: pending.length.toString(), note: `USD ${pendingUsd.toFixed(2)} · CRC ${pendingCrc.toFixed(2)}`, icon: CircleDollarSign },
    { label: t.openTasks, value: "—", note: t.activeFollowups, icon: ClipboardCheck },
    { label: t.maintenance, value: outOfService.toString(), note: t.pending, icon: Wrench }
  ];
  return (
    <main className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">{t.morning}</p><h1>{t.greeting}</h1><p>{t.dayStarts}</p></div><CsvImportPanel locale={locale} /></div>
      <section className="metric-grid" aria-label="Indicadores del día">
        {cards.map(({ label, value, note, icon: Icon }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
      </section>
      <section className="foundation-panel">
        <div><p className="eyebrow">MODULE 1</p><h2>{t.foundationReady}</h2><p>{t.foundationBody}</p></div>
        <ol><li><span>01</span>{t.connectSupabase}</li><li><span>02</span>{t.applyMigrations}</li><li><span>03</span>{t.createOwner}</li></ol>
      </section>
    </main>
  );
}
