"use client";

import { useOptimistic, useTransition } from "react";
import { setLocale } from "@/features/auth/locale-actions";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const [optimisticLocale, setOptimisticLocale] = useOptimistic(locale);
  const [, startTransition] = useTransition();
  return (
    <div className="language-switcher" aria-label="Language">
      {(["es", "en"] as const).map((value) => (
        <button key={value} onClick={() => startTransition(async () => { setOptimisticLocale(value); const data = new FormData(); data.set("locale", value); await setLocale(data); })} className={optimisticLocale === value ? "active" : ""} aria-pressed={optimisticLocale === value}>
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
