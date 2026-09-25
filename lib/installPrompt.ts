/**
 * Shared PWA install state for the corner banner and the top-bar "Instalar app" item.
 * Chrome/Edge (desktop and mobile) fire `beforeinstallprompt`; iPhone/iPad never do, so they get a manual tip instead.
 * The listener is attached when this module first loads in the browser, so an early event is not missed.
 */

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export type InstallState = { canPrompt: boolean; ios: boolean; installed: boolean; bannerHidden: boolean; iosTipOpen: boolean };

const DISMISSED_KEY = "yulios-install-dismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

const SERVER_STATE: InstallState = { canPrompt: false, ios: false, installed: false, bannerHidden: true, iosTipOpen: false };

let deferred: BeforeInstallPromptEvent | null = null;
let iosTipOpen = false;
let snapshot: InstallState | null = null;
const listeners = new Set<() => void>();

function emit() {
  snapshot = null;
  listeners.forEach((l) => l());
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// iPadOS 13+ reports itself as a Mac; the touch check tells them apart from desktop Macs.
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Dismissal lasts 7 days, then the banner may show again. */
function isDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; iosTipOpen = false; emit(); });
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getInstallState(): InstallState {
  snapshot ??= { canPrompt: deferred !== null, ios: isIOS(), installed: isStandalone(), bannerHidden: isDismissed(), iosTipOpen };
  return snapshot;
}

export function getServerInstallState(): InstallState {
  return SERVER_STATE;
}

/** Chrome/Edge: open the browser's install dialog. iPhone/iPad: show the Share → Add to Home Screen tip. */
export async function requestInstall() {
  if (deferred) {
    const event = deferred;
    await event.prompt();
    await event.userChoice;
    deferred = null;
    emit();
  } else if (isIOS()) {
    iosTipOpen = true;
    emit();
  }
}

export function dismissInstall() {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
  iosTipOpen = false;
  emit();
}
