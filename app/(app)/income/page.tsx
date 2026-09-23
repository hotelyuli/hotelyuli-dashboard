import { cookies } from "next/headers";
import { formatInTimeZone } from "date-fns-tz";
import { requireSession } from "@/features/auth/logic/guards";
import { RegisterButton } from "@/features/records/components/RegisterForms";
import { settledTotals } from "@/features/records/logic/settlement";
import type { Locale } from "@/lib/i18n";

export default async function IncomePage() {
  const locale = ((await cookies()).get("yulios-locale")?.value ?? "es") as Locale;
  const es = locale === "es";
  const { supabase, user } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("hotel_id").eq("id", user.id).single();
  const operationDate = formatInTimeZone(new Date(), "America/Costa_Rica", "yyyy-MM-dd");
  const { data: entries } = await supabase.from("income_entries").select("id,room_number,guest_name,paid,category,amount,currency,payment_method,reference_note,created_at,entry_type,reason").eq("hotel_id", profile?.hotel_id ?? "").eq("operation_date", operationDate).order("created_at", { ascending: false });
  // Only settled money counts: unpaid entries are listed but excluded, reversals subtract.
  const totals = settledTotals((entries ?? []).map((entry) => ({ amount: entry.amount, currency: entry.currency, paid: entry.paid, entryType: entry.entry_type })));
  const unpaidCount = (entries ?? []).filter((entry) => !entry.paid).length;
  return <main className="dashboard-page income-page"><div className="page-heading"><div><p className="eyebrow">{es ? "CAJA" : "CASHIER"}</p><h1>{es ? "Ingresos" : "Income"}</h1><p>{es ? "USD y CRC se mantienen separados; los totales cuentan solo lo cobrado (los reversos restan). Cada registro queda en cola para Google Sheets." : "USD and CRC stay separate; totals count settled money only (reversals subtract). Each entry is queued for Google Sheets."}</p></div><RegisterButton kind="income" locale={locale} /></div><section className="record-summary-grid"><article className="record-summary-card"><span>USD</span><strong>${totals.USD.toFixed(2)}</strong></article><article className="record-summary-card"><span>CRC</span><strong>₡{totals.CRC.toFixed(2)}</strong></article>{unpaidCount > 0 && <article className="record-summary-card"><span>{es ? "Pendientes (no suman)" : "Unpaid (not counted)"}</span><strong>{unpaidCount}</strong></article>}</section><div className="board-table-wrap"><table className="board-table"><thead><tr><th>{es ? "Hora" : "Time"}</th><th>{es ? "Habitación" : "Room"}</th><th>{es ? "Huésped" : "Guest"}</th><th>{es ? "Categoría" : "Category"}</th><th>{es ? "Monto" : "Amount"}</th><th>{es ? "Pagado" : "Paid"}</th><th>{es ? "Método" : "Method"}</th><th>{es ? "Referencia" : "Reference"}</th></tr></thead><tbody>{entries?.length ? entries.map((entry) => { const reversal = entry.entry_type === "reversal"; return <tr key={entry.id} className={reversal ? "income-reversal" : entry.paid ? "" : "income-unpaid"}><td>{formatInTimeZone(new Date(entry.created_at), "America/Costa_Rica", "HH:mm")}</td><td>{entry.room_number ?? "—"}</td><td>{entry.guest_name}</td><td>{reversal ? `${es ? "Reverso" : "Reversal"} · ${entry.category}` : entry.category}</td><td>{entry.currency} {reversal ? "−" : ""}{Number(entry.amount).toFixed(2)}</td><td><span className={`state-pill ${entry.paid ? "state-completed" : "state-cancelled"}`}>{entry.paid ? (es ? "Sí" : "Yes") : "No"}</span></td><td>{entry.payment_method}</td><td>{reversal ? `${es ? "Motivo" : "Reason"}: ${entry.reason ?? "—"}` : entry.reference_note ?? "—"}</td></tr>; }) : <tr><td colSpan={8} className="empty-table-cell">{es ? "Todavía no hay ingresos registrados hoy." : "No income has been registered today."}</td></tr>}</tbody></table></div></main>;
}
