import { subscribePush, unsubscribePush } from "@/features/notifications/actions";

/**
 * Shared Web Push state for the top-bar button and the dashboard banner (same pattern
 * as installPrompt.ts). The permission prompt only ever runs from a click: browsers
 * and iOS require a user gesture.
 *
 * mode: "unsupported" (hide), "ios-install" (iPhone/iPad in Safari: install first),
 * "blocked" (permission denied), "off", "on".
 */
export type PushMode = "unsupported" | "ios-install" | "blocked" | "off" | "on";
export type PushState = { mode: PushMode; busy: boolean; error: string | null; bannerHidden: boolean; checked: boolean };

const DISMISSED_KEY = "yulios-push-banner-dismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const SERVER_STATE: PushState = { mode: "unsupported", busy: false, error: null, bannerHidden: true, checked: false };

let subscribed = false;
let checked = false;
let busy = false;
let error: string | null = null;
let snapshot: PushState | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  snapshot = null;
  listeners.forEach((l) => l());
}

const vapidKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function pushSupported() {
  return Boolean(vapidKey()) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function currentMode(): PushMode {
  if (!pushSupported()) return vapidKey() && isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return subscribed && Notification.permission === "granted" ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

/** Reads this device's subscription once per page load and re-saves it, so the server row exists for the current user. */
async function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    if (pushSupported() && Notification.permission === "granted") {
      const existing = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (existing) {
        subscribed = true;
        void subscribePush(existing.toJSON()).catch(() => {});
      }
    }
  } catch {
    // Treat as off: the user can enable from the button.
  }
  checked = true;
  emit();
}

export function subscribePushState(listener: () => void) {
  listeners.add(listener);
  void start();
  return () => { listeners.delete(listener); };
}

export function getPushState(): PushState {
  snapshot ??= { mode: currentMode(), busy, error, bannerHidden: isDismissed(), checked };
  return snapshot;
}

export function getServerPushState(): PushState {
  return SERVER_STATE;
}

/** Must be called from a click handler. */
export async function enablePush(failedMessage: string) {
  if (busy || !pushSupported()) return;
  busy = true; error = null; emit();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const subscription = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey()) }));
    const result = await subscribePush(subscription.toJSON());
    if (!result.ok) throw new Error(result.error);
    subscribed = true;
  } catch (cause) {
    console.error("[push] enable failed", cause);
    error = failedMessage;
  } finally {
    busy = false;
    emit();
  }
}

export async function disablePush(failedMessage: string) {
  if (busy) return;
  busy = true; error = null; emit();
  try {
    const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    }
    subscribed = false;
  } catch (cause) {
    console.error("[push] disable failed", cause);
    error = failedMessage;
  } finally {
    busy = false;
    emit();
  }
}

export function dismissPushBanner() {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
  emit();
}
