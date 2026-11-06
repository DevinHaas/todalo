import { useRef } from "react";
import { useLocation, useNavigate, type Location } from "react-router";
import { hapticsSupported } from "./feedback";

/** Settings categories; `terms` are the settings inside, matched by the nav search. */
export const settingsSections = [
  { id: "account", name: "Account", terms: ["Photo", "Name", "Email", "Log out"] },
  { id: "general", name: "General", terms: ["Smart date recognition", "Show goals", ...(hapticsSupported ? ["Haptic feedback"] : [])] },
  { id: "theme", name: "Theme", terms: ["Dark theme"] },
  { id: "keyboard-shortcuts", name: "Keyboard shortcuts", terms: ["Shortcut help"] },
  { id: "calendars", name: "Calendars", terms: ["Google Calendar", "Show events"] },
  { id: "integrations", name: "Integrations", terms: ["Import from Todoist"] },
] as const;
export type SettingsSection = (typeof settingsSections)[number]["id"];

/** Categories whose name or settings contain `query`, with the settings that matched. */
export function searchSettings(query: string) {
  const q = query.trim().toLowerCase();
  return settingsSections.flatMap((section) => {
    if (!q || section.name.toLowerCase().includes(q)) return [{ section, matches: [] as string[] }];
    const matches = section.terms.filter((term) => term.toLowerCase().includes(q));
    return matches.length ? [{ section, matches }] : [];
  });
}

/** Old `/account#…` and `/settings#…` anchors → their section. */
export const legacyHash: Record<string, SettingsSection> = { "#import": "integrations", "#keyboard-shortcuts": "keyboard-shortcuts", "#calendars": "calendars" };
export const legacySettingsPath = (hash: string) => `/settings/${legacyHash[hash] ?? "account"}`;

export const isSettingsPath = (pathname: string) => pathname === "/settings" || pathname.startsWith("/settings/");
type SettingsState = { background?: Pick<Location, "pathname" | "search" | "hash"> };
/** The screen settings opened over; a direct link opens it over Today. */
export const settingsBackground = (location: Location) =>
  (location.state as SettingsState | null)?.background ?? (isSettingsPath(location.pathname) ? { pathname: "/today", search: "", hash: "" } : undefined);

/** Opens settings (one section, or the list) over the current screen. */
export function useOpenSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const here = useRef(location);
  here.current = location;
  return (section?: SettingsSection) => {
    const from = here.current;
    const background = settingsBackground(from) ?? { pathname: from.pathname, search: from.search, hash: from.hash };
    navigate(section ? `/settings/${section}` : "/settings", { state: { background } satisfies SettingsState, replace: isSettingsPath(from.pathname) });
  };
}
