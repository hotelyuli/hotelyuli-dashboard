"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowUpRight, LogIn, LogOut, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { commitCsvImport, type ImportState } from "@/features/csv-import/actions";
import { parseCsv, type ParsedCsv } from "@/features/csv-import/logic/parser";
import { dictionary, type Locale } from "@/lib/i18n";

type ImportKind = "check_in" | "check_out";
type LoadedFile = ParsedCsv & { name: string; kind: ImportKind };
const initialState: ImportState = { status: "idle" };

export function CsvImportPanel({ locale, variant = "compact" }: { locale: Locale; variant?: "compact" | "cards" }) {
  const t = dictionary(locale);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [error, setError] = useState("");
  const checkInRef = useRef<HTMLInputElement>(null);
  const checkOutRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(commitCsvImport, initialState);

  async function loadFile(kind: ImportKind, file?: File) {
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      setLoaded({ ...parsed, name: file.name, kind });
      setError(""); setOpen(true);
    } catch { setError(t.invalidCsv); setOpen(true); }
  }

  return <>
    <div className={`csv-actions ${variant === "cards" ? "import-card-grid" : ""}`}>
      {variant === "cards" ? <>{(["check_in", "check_out"] as const).map(kind => {
        const arrival = kind === "check_in"; const Icon = arrival ? LogIn : LogOut; const es = locale === "es";
        return <button key={kind} type="button" className={`import-card ${arrival ? "is-arrival" : "is-departure"}`} onClick={() => (arrival ? checkInRef : checkOutRef).current?.click()}>
          <span className="import-card-top"><span className="import-icon"><Icon size={20} aria-hidden="true" /></span><ArrowUpRight size={18} aria-hidden="true" /></span>
          <strong>{arrival ? "Check-ins CSV" : "Check-outs CSV"}</strong><span className="import-description">{es ? (arrival ? "Subir llegadas de hoy" : "Subir salidas de hoy") : (arrival ? "Upload today's arrivals" : "Upload today's departures")}</span>
          <span className="import-card-action"><Upload size={13} aria-hidden="true" />{es ? "Cargar archivo" : "Upload file"}</span>
        </button>;
      })}</> : <><button className="primary-button" onClick={() => checkInRef.current?.click()}><Upload size={17} />{t.importCheckIns}</button><button className="secondary-button" onClick={() => checkOutRef.current?.click()}><Upload size={17} />{t.importCheckOuts}</button></>}
      <input ref={checkInRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => loadFile("check_in", event.target.files?.[0])} />
      <input ref={checkOutRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => loadFile("check_out", event.target.files?.[0])} />
    </div>
    {open && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="csv-modal" role="dialog" aria-modal="true" aria-labelledby="csv-title">
        <header><div><p className="eyebrow">LITTLE HOTELIER</p><h2 id="csv-title">{t.csvImportTitle}</h2></div><button onClick={() => setOpen(false)} aria-label={t.cancel}><X /></button></header>
        {error && <p className="form-error">{error}</p>}
        {loaded && <form action={action}>
          <input type="hidden" name="payload" value={JSON.stringify({ fileType: loaded.kind, fileName: loaded.name, headers: loaded.headers, rows: loaded.rows })} />
          <div className="csv-file-summary"><FileSpreadsheet /><div><strong>{loaded.name}</strong><small>{loaded.rows.length} {t.rowsDetected} · {loaded.headers.length} {t.columnsDetected}</small></div><CheckCircle2 className="success-icon" /></div>
          <h3>{t.preview}</h3>
          <div className="csv-preview"><table><thead><tr>{loaded.headers.slice(0, 8).map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{loaded.rows.slice(0, 5).map((row, index) => <tr key={index}>{loaded.headers.slice(0, 8).map(header => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div>
          {state.status === "success" && <p className="success-message">{t.importSaved}</p>}
          {state.status === "success" && state.rowErrors && state.rowErrors.length > 0 && (
            <div className="form-error">
              <p>{t.importRowErrors}</p>
              <ul>{state.rowErrors.map((rowError, index) => <li key={index}>{rowError}</li>)}</ul>
            </div>
          )}
          {state.status === "error" && <p className="form-error">{t.invalidCsv}</p>}
          <footer><button type="button" className="secondary-button" onClick={() => (loaded.kind === "check_in" ? checkInRef : checkOutRef).current?.click()}>{t.replaceFile}</button><button className="primary-button" disabled={pending}>{pending ? "…" : t.confirmImport}</button></footer>
        </form>}
      </section>
    </div>}
  </>;
}
