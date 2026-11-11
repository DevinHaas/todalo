"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { isPlatform, keyStyle, PLATFORM_KEY, platformScript, platformStyles, resolvePlatform, type Platform } from "../lib/platform";

const PLATFORM_CHANGE = "todalo-help-platform-change";

type PlatformContextValue = { platform: Platform; setPlatform: (platform: Platform) => void };
const PlatformContext = createContext<PlatformContextValue | null>(null);

function reportedOS(): string {
  const browser = navigator as Navigator & { userAgentData?: { platform?: string } };
  return browser.userAgentData?.platform || browser.platform || "";
}

function readStoredPlatform(): Platform {
  let stored = null;
  try {
    stored = localStorage.getItem(PLATFORM_KEY);
  } catch {}
  return resolvePlatform(stored, reportedOS());
}

function readPlatform(): Platform {
  const platform = document.documentElement.getAttribute("data-platform");
  return isPlatform(platform) ? platform : readStoredPlatform();
}

function applyPlatform(platform: Platform) {
  document.documentElement.setAttribute("data-platform", platform);
  document.documentElement.setAttribute("data-key-style", keyStyle(platform, reportedOS()));
}

function setPlatform(platform: Platform) {
  applyPlatform(platform);
  try {
    localStorage.setItem(PLATFORM_KEY, platform);
  } catch {}
  window.dispatchEvent(new Event(PLATFORM_CHANGE));
}

function subscribe(onChange: () => void) {
  applyPlatform(readPlatform());
  const onStorage = (event: StorageEvent) => {
    if ((event.storageArea && event.storageArea !== localStorage) || (event.key !== null && event.key !== PLATFORM_KEY)) return;
    applyPlatform(resolvePlatform(event.newValue, reportedOS()));
    onChange();
  };
  window.addEventListener(PLATFORM_CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PLATFORM_CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function serverPlatform(): Platform {
  return "web";
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const platform = useSyncExternalStore(subscribe, readPlatform, serverPlatform);
  return (
    <PlatformContext.Provider value={{ platform, setPlatform }}>
      <style dangerouslySetInnerHTML={{ __html: platformStyles }} />
      <script dangerouslySetInnerHTML={{ __html: platformScript }} />
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const context = useContext(PlatformContext);
  if (!context) throw new Error("Platform components must be wrapped in PlatformProvider.");
  return context;
}
