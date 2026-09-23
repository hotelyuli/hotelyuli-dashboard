import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { can, type AppRole } from "@/features/auth/logic/permissions";
import { ReportEditor } from "@/features/shift-reports/ReportEditor";
import { reportInput, type ReportInput } from "@/features/shift-reports/logic";
import type { Locale } from "@/lib/i18n";
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{date?:string;shift?:string}> }) {
  const query = await searchParams;
  const cookieStore = await cookies();
  const locale = (cookieStore.get("yulios-locale")?.value === "en" ? "en" : "es") as Locale;
  const es = locale === "es";
  const today = formatInTimeZone(new Date(),"America/Costa_Rica","yyyy-MM-dd");
  const parsedDate = reportInput.shape.date.safeParse(query.date);
  const date = parsedDate.success ? parsedDate.data : today;
  const requestedShift = query.shift ?? cookieStore.get("yulios-shift")?.value;
  const shift = requestedShift === "night" ? "night" : requestedShift === "afternoon" ? "afternoon" : "morning";
  const { supabase,user } = await requireSession();
  const {data:profile} = await supabase.from("profiles").select("hotel_id,role,active,full_name").eq("id",user.id).single();
  if (!profile?.active || !can(profile.role as AppRole,"operations:write")) return <main className="dashboard-page"><h1>{es ? "Acceso restringido" : "Access restricted"}</h1></main>;
  const [events,report,assignment] = await Promise.all([
    supabase.from("shift_events").select("id,event_time,room_area,description,status").eq("hotel_id",profile.hotel_id).eq("operation_date",date).order("event_time"),
    supabase.from("shift_reports").select("*").eq("hotel_id",profile.hotel_id).eq("operation_date",date).eq("shift",shift).maybeSingle(),
    supabase.from("daily_staff_assignments").select("morning_receptionist,afternoon_receptionist,security_guard").eq("hotel_id",profile.hotel_id).eq("operation_date",date).maybeSingle()
  ]);
  if(events.error) throw new Error("EVENTS_LOAD_FAILED");
  const saved = report.data;
  const parsed = reportInput.safeParse(saved?.inputs);
  const initial: ReportInput = parsed.success ? parsed.data : {date,shift,receptionist:(shift === "morning" ? assignment.data?.morning_receptionist : shift === "afternoon" ? assignment.data?.afternoon_receptionist : null) ?? profile.full_name ?? "",eventIds:(events.data ?? []).map(event => event.id),notes:"",breakfastSent:false,arrivalsContacted:false,takeawayReady:false,eventsReviewed:false,tasksReviewed:false,breakfastReviewed:false,incomeReviewed:false,cashReviewed:false,handover:false};
  return <main className="dashboard-page reports-page"><div className="page-heading"><div><p className="eyebrow">{es ? "ENTREGA DE TURNO" : "SHIFT HANDOVER"}</p><h1>{es ? "Cierre y reporte" : "Shift report & close"}</h1><p>{es ? "Revise los hechos, edite el reporte en inglés y confirme la entrega." : "Review the facts, edit the English report and confirm handover."}</p></div></div>
    <form className="report-selector" action="/reports"><label>{es ? "Fecha" : "Date"}<input name="date" type="date" defaultValue={date} required /></label><label>{es ? "Turno" : "Shift"}<select name="shift" defaultValue={shift}><option value="morning">{es ? "Mañana" : "Morning"}</option><option value="afternoon">{es ? "Tarde" : "Afternoon"}</option><option value="night">{es ? "Noche" : "Night"}</option></select></label><button className="secondary-button">{es ? "Abrir reporte" : "Open report"}</button></form>
    <ReportEditor key={`${date}-${shift}`} locale={locale} initial={initial} events={events.data ?? []} initialText={saved?.final_report_en ?? ""} initialRevision={saved?.revision ?? 0} initiallyClosed={saved?.status === "closed"} storageReady={!report.error} />
  </main>;
}
