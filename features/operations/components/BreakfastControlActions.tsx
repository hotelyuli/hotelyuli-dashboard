"use client";

import { useState, useSyncExternalStore } from "react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { breakfastPdfName, breakfastPngName, shareOrDownload } from "@/features/reports/logic/share-file";
import { A4_PORTRAIT, canSharePdf, downloadFile, sheetPdf, sheetPng, subscribePhone } from "@/features/reports/logic/sheet-capture";
import type { Locale } from "@/lib/i18n";

const cardPdf = (targetId: string, fileName: string) => sheetPdf(targetId, fileName, A4_PORTRAIT);
const cardPng = (targetId: string) => sheetPng(targetId, A4_PORTRAIT);

/**
 * Sharing for the restaurant. Everything happens in the browser: nothing is saved to the database.
 * Order: Descargar PDF · Compartir (phones) · Imprimir · Copiar imagen · Copiar texto · WhatsApp texto.
 * `text` (with emoji) is for Copiar texto; `whatsappText` is the emoji-free version for the wa.me link,
 * because WhatsApp Desktop on Windows shows emoji from the link as U+FFFD.
 */
export function BreakfastControlActions({ targetId, date, text, whatsappText, locale }: { targetId: string; date: string; text: string; whatsappText: string; locale: Locale }) {
  const es = locale === "es";
  const canShare = useSyncExternalStore(subscribePhone, canSharePdf, () => false);
  const [busy, setBusy] = useState<"" | "pdf" | "share" | "image">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fileName = breakfastPdfName(date);

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
    downloadFile(await cardPdf(targetId, fileName));
    return es ? "PDF descargado." : "PDF downloaded.";
  });

  const sharePdf = () => run("share", async () => {
    const result = await shareOrDownload(await cardPdf(targetId, fileName), navigator, downloadFile);
    return result === "downloaded" ? (es ? "Este teléfono no comparte archivos: PDF descargado." : "This phone can't share files: PDF downloaded.") : "";
  });

  // Copies the sheet as a picture; where the browser can't copy images, downloads the PNG instead.
  const copyImage = () => run("image", async () => {
    const png = cardPng(targetId);
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        // Safari needs the ClipboardItem created synchronously in the click, with a promise for the data.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        return es ? "Imagen copiada." : "Image copied.";
      } catch {
        // fall through to the download
      }
    }
    downloadFile(new File([await png], breakfastPngName(date), { type: "image/png" }));
    return es ? "No se puede copiar imágenes aquí: PNG descargado." : "Images can't be copied here: PNG downloaded.";
  });

  async function copyText() {
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(es ? "Texto copiado." : "Text copied.");
    } catch {
      setError(es ? "No se pudo copiar. Seleccione y copie el texto." : "Could not copy. Select and copy the text.");
    }
  }

  return (
    <div className="message-actions breakfast-control-actions">
      <button className="primary-button" type="button" onClick={downloadPdf} disabled={busy !== ""}>{busy === "pdf" ? (es ? "Creando PDF…" : "Creating PDF…") : (es ? "Descargar PDF" : "Download PDF")}</button>
      {canShare && <button className="secondary-button" type="button" onClick={sharePdf} disabled={busy !== ""}>{busy === "share" ? (es ? "Preparando…" : "Preparing…") : (es ? "Compartir" : "Share")}</button>}
      <button className="secondary-button" type="button" onClick={() => window.print()}>{es ? "Imprimir" : "Print"}</button>
      <button className="secondary-button" type="button" onClick={copyImage} disabled={busy !== ""}>{busy === "image" ? (es ? "Copiando…" : "Copying…") : (es ? "Copiar imagen" : "Copy image")}</button>
      <button className="secondary-button" type="button" onClick={copyText}>{es ? "Copiar texto" : "Copy text"}</button>
      <a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon />{es ? "WhatsApp texto" : "WhatsApp text"}</a>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
