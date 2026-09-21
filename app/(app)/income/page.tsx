import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import type { Locale } from "@/lib/i18n";

export default async function IncomePage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { data: entries } = await supabase.from("income_entries").select("id,room_number,guest_name,paid,category,amount,currency,payment_method,reference_note,created_at").eq("hotel_id", profile?.hotel_id ?? "").eq("operation_date", operationDate).order("created_at", { ascending: false });
  const usd = (entries ?? []).filter((entry) => entry.currency === "USD").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const crc = (entries ?? []).filter((entry) => entry.currency === "CRC").reduce((sum, entry) => sum + Number(entry.amount), 0);
  return <main className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">{es ? "CAJA" : "CASHIER"}</p><h1>{es ? "Ingresos" : "Income"}</h1><p>{es ? "USD y CRC se mantienen separados; cada registro queda en cola para Google Sheets." : "USD and CRC stay separate; each entry is queued for Google Sheets."}</p></div><RegisterButton kind="income" locale={locale} /></div><section className="record-summary-grid"><article className="record-summary-card">USD<strong>${usd.toFixed(2)}</strong></article><article className="record-summary-card">CRC<strong>₡{crc.toFixed(2)}</strong></article></section><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Hora" : "Time"}</th><th>{es ? "Habitación" : "Room"}</th><th>{es ? "Huésped" : "Guest"}</th><th>{es ? "Categoría" : "Category"}</th><th>{es ? "Monto" : "Amount"}</th><th>{es ? "Pagado" : "Paid"}</th><th>{es ? "Método" : "Method"}</th><th>{es ? "Referencia" : "Reference"}</th></tr></thead><tbody>{entries?.length ? entries.map((entry) => <tr key={entry.id}><td>{formatInTimeZone(new Date(entry.created_at), "America/Costa_Rica", "HH:mm")}</td><td>{entry.room_number ?? "—"}</td><td>{entry.guest_name}</td><td>{entry.category}</td><td>{entry.currency} {Number(entry.amount).toFixed(2)}</td><td>{entry.paid ? (es ? "Sí" : "Yes") : "No"}</td><td>{entry.payment_method}</td><td>{entry.reference_note ?? "—"}</td></tr>) : <tr><td colSpan={8} className="empty-table-cell">{es ? "Todavía no hay ingresos registrados hoy." : "No income has been registered today."}</td></tr>}</tbody></table></div></main>;
}
