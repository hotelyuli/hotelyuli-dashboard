"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { RoomBoardSheet } from "@/features/operations/components/RoomBoardSheet";
import type { BoardSheetSummary } from "@/features/operations/logic/board-sheet";
import { boardPdfName, boardPngName, shareOrDownload } from "@/features/reports/logic/share-file";
import { A4_LANDSCAPE, canSharePdf, downloadFile, sheetPdf, sheetPng, subscribePhone } from "@/features/reports/logic/sheet-capture";
import type { Locale } from "@/lib/i18n";

export const BOARD_SHEET_ID = "room-board-sheet";

// "Incluir pagos" starts off, so a printed or shared board never shows balances by accident.
const IncludePayments = createContext<{ value: boolean; set: (value: boolean) => void }>({ value: false, set: () => {} });

export function RoomBoardPrintProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState(false);
  return <IncludePayments.Provider value={{ value, set }}>{children}</IncludePayments.Provider>;
}

/** The sheet under the board: what Imprimir, Descargar PDF and Descargar PNG produce. */
export function RoomBoardPrintSheet({ date, generatedAt, summary }: { date: string; generatedAt: Date; summary: BoardSheetSummary }) {
  const { value } = useContext(IncludePayments);
  return <RoomBoardSheet id={BOARD_SHEET_ID} date={date} generatedAt={generatedAt} summary={summary} includePayments={value} />;
}

/**
 * Descargar PDF · Imprimir · Descargar PNG · Compartir (phones that can share files) · Incluir pagos.
 * Everything happens in the browser: nothing is saved to the database.
 */
export function RoomBoardPrintActions({ date, locale }: { date: string; locale: Locale }) {
  const es = locale === "es";
  const includePayments = useContext(IncludePayments);
  const canShare = useSyncExternalStore(subscribePhone, canSharePdf, () => false);
  const [busy, setBusy] = useState<"" | "pdf" | "share" | "image">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pdf = () => sheetPdf(BOARD_SHEET_ID, boardPdfName(date), A4_LANDSCAPE);

  async function run(kind: "pdf" | "share" | "image", task: () => Promise<string>) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      setNotice(await task());
    } catch {
      setError(kind === "image"
        ? (es ? "No se pudo crear la imagen. Use Descargar PDF." : "Could not create the image. Use Download PDF.")
        : (es ? "No se pudo crear el PDF. Use Imprimir." : "Could not create the PDF. Use Print."));
    } finally {
      setBusy("");
    }
  }

  const downloadPdf = () => run("pdf", async () => {
    downloadFile(await pdf());
    return es ? "PDF descargado." : "PDF downloaded.";
  });

  const downloadPng = () => run("image", async () => {
    downloadFile(new File([await sheetPng(BOARD_SHEET_ID, A4_LANDSCAPE)], boardPngName(date), { type: "image/png" }));
    return es ? "PNG descargado." : "PNG downloaded.";
  });

  const sharePdf = () => run("share", async () => {
    const result = await shareOrDownload(await pdf(), navigator, downloadFile);
    return result === "downloaded" ? (es ? "Este teléfono no comparte archivos: PDF descargado." : "This phone can't share files: PDF downloaded.") : "";
  });

  return (
    <div className="message-actions room-board-actions">
      <button className="primary-button" type="button" onClick={downloadPdf} disabled={busy !== ""}>{busy === "pdf" ? (es ? "Creando PDF…" : "Creating PDF…") : (es ? "Descargar PDF" : "Download PDF")}</button>
      <button className="secondary-button" type="button" onClick={() => window.print()}>{es ? "Imprimir" : "Print"}</button>
      <button className="secondary-button" type="button" onClick={downloadPng} disabled={busy !== ""}>{busy === "image" ? (es ? "Creando PNG…" : "Creating PNG…") : (es ? "Descargar PNG" : "Download PNG")}</button>
      {canShare && <button className="secondary-button" type="button" onClick={sharePdf} disabled={busy !== ""}>{busy === "share" ? (es ? "Preparando…" : "Preparing…") : (es ? "Compartir" : "Share")}</button>}
      <label className="room-board-payments"><input type="checkbox" checked={includePayments.value} onChange={(event) => includePayments.set(event.target.checked)} />{es ? "Incluir pagos" : "Include payments"}</label>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
