"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { dismissInstall, getInstallState, getServerInstallState, requestInstall, subscribeInstall } from "@/lib/installPrompt";

function useInstallState() {
  return useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
}

/** Corner banner: Chrome/Edge (any screen size) get the install button, iPhone/iPad get the Share tip. Dismiss hides it for 7 days. */
export function InstallPrompt() {
  const { canPrompt, ios, installed, bannerHidden, iosTipOpen } = useInstallState();
  if (installed) return null;
  const showButton = canPrompt && !bannerHidden;
  const showIOS = ios && !canPrompt && (iosTipOpen || !bannerHidden);
  if (!showButton && !showIOS) return null;

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 50, display: "flex", alignItems: "flex-start", gap: 8 }}>
      {showButton && (
        <button onClick={requestInstall} style={{ background: "#4D333E", color: "#fff", border: 0, borderRadius: 999, padding: "10px 16px", fontSize: 14 }}>
          Instalar YuliOS
        </button>
      )}
      {showIOS && (
        <div style={{ background: "#F0EAE4", color: "#4D333E", borderRadius: 8,
          padding: "10px 14px", fontSize: 13, maxWidth: 260 }}>
          En iPhone/iPad: toca <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>.
        </div>
      )}
      <button onClick={dismissInstall} aria-label="Cerrar" style={{ background: "transparent", border: 0, color: "#76666d", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
    </div>
  );
}

/** Top-bar "Instalar app" item: always reachable (even after the banner is dismissed) while the app can be installed. */
export function InstallAppButton() {
  const { canPrompt, ios, installed } = useInstallState();
  if (installed || (!canPrompt && !ios)) return null;
  return (
    <button type="button" className="icon-button" onClick={requestInstall} aria-label="Instalar app" title="Instalar app">
      <Download size={18} />
    </button>
  );
}
