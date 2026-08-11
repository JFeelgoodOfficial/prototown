import type { SeatRef } from "./types";

/**
 * Turn alerts via Web Push. Android Chrome and desktop browsers work from a
 * normal tab; iOS (16.4+) only delivers push to web apps added to the Home
 * Screen, so the UI shows an install hint there instead of failing.
 */

export type PushSupport = "ok" | "needs-install" | "denied" | "unsupported";

export function pushConfigured(): boolean {
  return Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (!pushConfigured()) return "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function alertsEnabled(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  return (await reg.pushManager.getSubscription()) !== null;
}

/** Must run from a user gesture (both permission prompt and iOS rules). */
export async function enableTurnAlerts(ref: SeatRef): Promise<boolean> {
  if (pushSupport() !== "ok") return false;
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW());
  if (!reg) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY as string),
    }));
  const api = await import("./client");
  await api.savePushSubscription(ref, subscription.toJSON());
  return true;
}

export async function disableTurnAlerts(ref: SeatRef): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  await subscription?.unsubscribe();
  const api = await import("./client");
  await api.savePushSubscription(ref, null).catch(() => undefined);
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
