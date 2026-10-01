"use client";

import { useState } from "react";
import { fitImageToPage } from "@/features/reports/logic/pdf-fit";
import type { Locale } from "@/lib/i18n";

/** Saves the element with id `targetId` as a one-page A4 PDF. */
export function DownloadPdfButton({ targetId, fileName, locale }: { targetId: string; fileName: string; locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const es = locale === "es";

  async function download() {
    const node = document.getElementById(targetId);
    if (!node) return;
    setBusy(true);
    setError("");
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      const image = await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const { x, y, width, height } = fitImageToPage(node.offsetWidth, node.offsetHeight);
      pdf.addImage(image, "PNG", x, y, width, height);
      pdf.save(fileName);
    } catch {
      setError(es ? "No se pudo crear el PDF. Use Imprimir." : "Could not create the PDF. Use Print.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="secondary-button" type="button" onClick={download} disabled={busy}>{busy ? (es ? "Creando PDF…" : "Creating PDF…") : (es ? "Descargar PDF" : "Download PDF")}</button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
