"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";

export function MessageActions({ text, locale }: { text: string; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const es = locale === "es";

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="message-actions">
      <button className="secondary-button" type="button" onClick={copy}>{copied ? (es ? "Copiado" : "Copied") : (es ? "Copiar" : "Copy")}</button>
      <a className="secondary-button" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <button className="secondary-button" type="button" onClick={() => window.print()}>{es ? "Imprimir" : "Print"}</button>
    </div>
  );
}
