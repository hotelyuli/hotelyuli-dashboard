"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { dictionary, type Locale } from "@/lib/i18n";
import { disablePush, dismissPushBanner, enablePush, getPushState, getServerPushState, subscribePushState } from "@/lib/pushClient";

function usePushState() {
  return useSyncExternalStore(subscribePushState, getPushState, getServerPushState);
}

const panelStyle: React.CSSProperties = {
  position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 60, width: 260, background: "#F0EAE4", color: "#4D333E",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, lineHeight: 1.4, boxShadow: "0 4px 14px rgba(0,0,0,.12)", textAlign: "left"
};

/** Top-bar item next to "Instalar app": turns this device's push notifications on or off. */
export function NotificationsButton({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  const { mode, busy, error } = usePushState();
  const [helpOpen, setHelpOpen] = useState(false);
  if (mode === "unsupported") return null;

  const help = mode === "blocked" ? t.notificationsBlocked : mode === "ios-install" ? t.notificationsIosHint : error;
  const label = mode === "on" ? t.notificationsDisable : t.notificationsEnable;
  const onClick = () => {
    if (mode === "on") void disablePush(t.notificationsFailed);
    else if (mode === "off") { setHelpOpen(true); void enablePush(t.notificationsFailed); }
    else setHelpOpen((open) => !open);
  };
  const Icon = mode === "on" ? BellRing : mode === "blocked" ? BellOff : Bell;

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className="icon-button" onClick={onClick} disabled={busy} aria-label={label} title={label} aria-pressed={mode === "on"}>
        <Icon size={18} />
      </button>
      {help && helpOpen && (
        <div role="status" style={panelStyle}>
          {help}
          <button type="button" onClick={() => setHelpOpen(false)} aria-label={t.close} style={{ background: "transparent", border: 0, color: "#76666d", fontSize: 16, padding: "0 0 0 6px", float: "right" }}>×</button>
        </div>
      )}
    </span>
  );
}

/** Dashboard banner for users who have not turned notifications on this device. Dismiss hides it for 7 days. */
export function NotificationsBanner({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  const { mode, busy, error, bannerHidden, checked } = usePushState();
  if (!checked || bannerHidden || (mode !== "off" && mode !== "ios-install")) return null;

  return (
    <div role="region" aria-label={t.notificationsEnable} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, background: "#F0EAE4", color: "#4D333E", borderRadius: 10, padding: "10px 14px", margin: "0 0 16px", fontSize: 14 }}>
      <Bell size={18} aria-hidden />
      <span style={{ flex: "1 1 220px" }}>{mode === "ios-install" ? t.notificationsIosHint : error ?? t.notificationsBanner}</span>
      {mode === "off" && (
        <button type="button" onClick={() => void enablePush(t.notificationsFailed)} disabled={busy} style={{ background: "#4D333E", color: "#fff", border: 0, borderRadius: 999, padding: "8px 16px", fontSize: 14 }}>
          {t.notificationsActivate}
        </button>
      )}
      <button type="button" onClick={dismissPushBanner} aria-label={t.close} style={{ background: "transparent", border: 0, color: "#76666d", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
    </div>
  );
}
