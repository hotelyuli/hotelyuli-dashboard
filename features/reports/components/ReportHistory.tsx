import { requireSession } from "@/features/auth/logic/guards";
import { MessageActions } from "./MessageActions";
export async function ReportHistory({kind,locale}:{kind:"breakfast"|"housekeeping";locale:"en"|"es"}){
 const {supabase,user}=await requireSession();
 const {data:profile}=await supabase.from("profiles").select("hotel_id,role,active").eq("id",user.id).single();
 if(!profile?.active || !["owner","manager","reception"].includes(profile.role)) return null;
 const {data,error}=await supabase.from("report_snapshots").select("id,operation_date,created_at,report_text,locale").eq("hotel_id",profile.hotel_id).eq("report_kind",kind).order("created_at",{ascending:false}).limit(30);
 const es=locale==="es";
 return <section className="message-summary"><h2>{es?"Reportes guardados — últimas 30 versiones":"Saved reports — latest 30 versions"}</h2>{error?<p role="alert">{es?"No se pudo cargar el historial":"Could not load report history"}</p>:data?.length?data.map(report=><details key={report.id} style={{padding:"12px 20px"}}><summary>{report.operation_date} · {new Intl.DateTimeFormat(es?"es-CR":"en-US",{timeZone:"America/Costa_Rica",dateStyle:"short",timeStyle:"short"}).format(new Date(report.created_at))} · {report.locale.toUpperCase()}</summary><pre>{report.report_text}</pre><MessageActions text={report.report_text} locale={report.locale} /></details>):<p>{es?"Todavía no hay reportes guardados.":"No saved reports yet."}</p>}</section>;
}
