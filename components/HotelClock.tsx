"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
export function HotelClock({ locale }: { locale: Locale }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const tick = () => setNow(new Date()); const id = setInterval(tick, 1000); return () => clearInterval(id); }, []);
  const options = { timeZone: "America/Costa_Rica" };
  return <div className="hotel-clock"><small>{now ? new Intl.DateTimeFormat(locale === "es" ? "es-CR" : "en-US", { ...options, dateStyle: "full" }).format(now) : "Costa Rica"}</small><strong>{now ? new Intl.DateTimeFormat("es-CR", { ...options, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now) : "—"}</strong></div>;
}
