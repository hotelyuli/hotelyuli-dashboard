"use client";

import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";

export function MessageActions({ text, locale }: { text: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const es = locale === "es";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(es ? "No se pudo copiar. Seleccione y copie el texto del reporte." : "Could not copy. Select and copy the report text.");
    }
  }

  function printReport() {
    const report = window.open("", "_blank", "width=800,height=700");
    if (!report) {
      setError(es ? "Permita ventanas emergentes para imprimir." : "Allow pop-ups to print.");
      return;
    }
    report.opener = null;
    report.document.title = "Hotel Yuli";
    report.document.documentElement.lang = locale;
    const body = report.document.createElement("pre");
    body.textContent = text;
    body.style.cssText = "white-space:pre-wrap;font:15px/1.7 Arial,sans-serif;margin:24px;color:#222";
    report.document.body.replaceChildren(body);
    report.focus();
    report.print();
    setError("");
  }

  return (
    <div className="message-actions">
      <button className="secondary-button" type="button" onClick={copy}>{copied ? (es ? "Copiado" : "Copied") : (es ? "Copiar" : "Copy")}</button>
      <a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon />WhatsApp</a>
      <button className="secondary-button" type="button" onClick={printReport}>{es ? "Imprimir / PDF" : "Print / PDF"}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
