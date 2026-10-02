"use client";

import { useState, useSyncExternalStore } from "react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { fitImageToPage } from "@/features/reports/logic/pdf-fit";
import { breakfastPdfName, breakfastPngName, shareOrDownload } from "@/features/reports/logic/share-file";
import type { Locale } from "@/lib/i18n";

// Width of the printable A4 area (190 mm) at 96 dpi, so the PDF and the image match the printout.
const CAPTURE_WIDTH_PX = 718;
const PHONE_QUERY = "(pointer: coarse)";
const subscribePhone = (onChange: () => void) => {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
/** Phones that can share a PDF file (navigator.canShare with files). */
function canSharePdf() {
  if (!window.matchMedia(PHONE_QUERY).matches || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File(["%PDF"], "desayunos.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

/** Renders a copy of the same sheet at A4 printable width (fonts loaded), then removes it. */
async function withPrintCopy<T>(targetId: string, render: (node: HTMLElement) => Promise<T>) {
  const card = document.getElementById(targetId);
  if (!card) throw new Error("CARD_NOT_FOUND");
  await document.fonts.ready;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${CAPTURE_WIDTH_PX}px;background:#fff`;
  const copy = card.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  // The on-screen top margin would shift the capture down and cut off the footer.
  copy.style.margin = "0";
  host.appendChild(copy);
  document.body.appendChild(host);
  try {
    return await render(copy);
  } finally {
    host.remove();
  }
}

async function cardCanvas(targetId: string) {
  const { toCanvas } = await import("html-to-image");
  return withPrintCopy(targetId, async (node) => ({
    canvas: await toCanvas(node, { pixelRatio: 2, backgroundColor: "#ffffff" }),
    width: node.offsetWidth,
    height: node.offsetHeight
  }));
}

async function cardPng(targetId: string) {
  const { canvas } = await cardCanvas(targetId);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("IMAGE_FAILED")), "image/png"));
}

async function cardPdf(targetId: string, fileName: string) {
  const [{ jsPDF }, image] = await Promise.all([import("jspdf"), cardCanvas(targetId)]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const { x, y, width, height } = fitImageToPage(image.width, image.height);
  // JPEG keeps the file small enough for WhatsApp/email; a PNG of the card is several MB.
  pdf.addImage(image.canvas.toDataURL("image/jpeg", 0.92), "JPEG", x, y, width, height);
  return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sharing for the restaurant. Everything happens in the browser: nothing is saved to the database.
 * Order: Descargar PDF · Compartir (phones) · Imprimir · Copiar imagen · Copiar texto · WhatsApp texto.
 */
export function BreakfastControlActions({ targetId, date, text, locale }: { targetId: string; date: string; text: string; locale: Locale }) {
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
      <a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon />{es ? "WhatsApp texto" : "WhatsApp text"}</a>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
