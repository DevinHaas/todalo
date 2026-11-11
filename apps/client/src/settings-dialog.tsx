import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, type To } from "react-router";
import { Blocks, Camera, CalendarDays, Sunrise, ChevronLeft, Keyboard, Palette, Search, Settings, Sparkles, UserRound, X } from "lucide-react";
import type { Account } from "./session";
import { session } from "./runtime";
import { haptics, hapticsSupported } from "./feedback";
import { legacyHash, legacySettingsPath, searchSettings, settingsBackground, settingsSections, type SettingsSection } from "./settings-nav";
import { theme } from "./theme";
import { SmartDatesSettingScreen } from "./settings-screen";
import { GoalsHiddenSettingScreen } from "./goal-screens";
import { SettingSwitch } from "./settings-views";
import { CalendarSettingsScreen } from "./calendar-screens";
import { ShortcutSettingsScreen } from "./keyboard-screens";
import { ImportSettingsScreen } from "./import-screen";
import { RitualSettingsScreen } from "./ritual-screens";
import { CoachSettingsScreen } from "./coach-screens";
import { BadgeCard, badgeSceneDefaults } from "@todalo/badge";
import { saveProfilePhoto, squarePhoto } from "./profile-photo";
import "./badge-fonts";

const icons: Record<SettingsSection, ReactNode> = {
  account: <UserRound />, general: <Settings />, theme: <Palette />, "keyboard-shortcuts": <Keyboard />, rituals: <Sunrise />, coach: <Sparkles />, calendars: <CalendarDays />, integrations: <Blocks />,
};

function AccountSection({ account }: { account: Account }) {
  const [pending, setPending] = useState(false);
  const [photo, setPhoto] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null });
  const picker = useRef<HTMLInputElement>(null);
  const { name, email, image } = account.user;
  const member = account.member;
  const savePhoto = async (next: () => Promise<string | null>) => {
    setPhoto({ saving: true, error: null });
    try { await saveProfilePhoto(await next()); await session.refresh(); setPhoto({ saving: false, error: null }); }
    catch { setPhoto({ saving: false, error: "Your photo could not be saved. Try another image." }); }
  };
  return <div className="account-settings">
    <section className="account-profile" aria-label="Profile">
      <button type="button" className="account-photo-button" aria-label="Change photo" title="Change photo" disabled={photo.saving} onClick={() => picker.current?.click()}>
        {image ? <img className="account-photo" src={image} alt="" /> : <span className="account-photo avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
        <span className="account-photo-edit" aria-hidden="true"><Camera /></span>
      </button>
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void savePhoto(() => squarePhoto(file)); }} />
      <div className="account-identity"><span className="account-name">{name}</span><span className="account-email">{email}</span>
        <span className="account-photo-actions">
          <button type="button" className="text-link" disabled={photo.saving} onClick={() => picker.current?.click()}>{photo.saving ? "Saving photo…" : "Change photo"}</button>
          {image && !photo.saving && <button type="button" className="text-link" onClick={() => void savePhoto(async () => null)}>Remove</button>}
        </span>
        {photo.error && <span className="account-photo-error" role="alert">{photo.error}</span>}
      </div>
      <button type="button" className="button outline" disabled={pending} onClick={async () => { setPending(true); await session.signOut(); setPending(false); }}>{pending ? "Please wait…" : "Log out"}</button>
    </section>
    {member && <section className="account-membership" aria-labelledby="membership-title">
      <h3 id="membership-title" className="account-section-title">Membership</h3>
      <div className="account-membership-body">
        {/* always the light card, like the printed badge; it doesn't follow the app theme */}
        <div className="account-badge"><BadgeCard member={member.number} name={name} since={member.since} founding={member.founding}
          logo="/todalo-logo.svg" params={badgeSceneDefaults} width="100%" /></div>
        <div className="account-member-info">
          <p className="account-member-title">Member #{member.number}</p>
          {member.founding && <p className="account-founding">Founding member: one of the first to join todalo.</p>}
          <dl>
            <div><dt>Joined</dt><dd>{new Date(member.since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</dd></div>
            <div><dt>Your tree</dt><dd>Grown from your member number. No two are alike, and yours never changes.</dd></div>
          </dl>
        </div>
      </div>
    </section>}
  </div>;
}

function GeneralSection({ userId }: { userId: string }) {
  const [feel, setFeel] = useState(haptics.enabled);
  return <div className="settings-general">
    <SmartDatesSettingScreen userId={userId} />
    <GoalsHiddenSettingScreen userId={userId} />
    {hapticsSupported && <SettingSwitch title="Haptic feedback" hint="Feel a tap when you complete a task." checked={feel}
      onChange={(on) => { haptics.set(on); setFeel(on); }} />}
  </div>;
}

function ThemeSection() {
  const dark = useSyncExternalStore(theme.subscribe, theme.dark);
  return <div className="settings-general">
    <SettingSwitch title="Dark theme" hint="Use the dark color scheme." checked={dark} onChange={(on) => theme.set(on)} />
  </div>;
}

function sectionBody(id: SettingsSection, account: Account): ReactNode {
  const userId = account.user.id;
  switch (id) {
    case "account": return <AccountSection account={account} />;
    case "general": return <GeneralSection userId={userId} />;
    case "theme": return <ThemeSection />;
    case "keyboard-shortcuts": return <ShortcutSettingsScreen userId={userId} />;
    case "rituals": return <RitualSettingsScreen userId={userId} />;
    case "coach": return <CoachSettingsScreen userId={userId} />;
    case "calendars": return <CalendarSettingsScreen userId={userId} />;
    case "integrations": return <ImportSettingsScreen userId={userId} />;
  }
}

/**
 * Settings modal (`/settings/:section`) over the screen it was opened from: a searchable
 * category list and the chosen page. Narrow screens show one column: `/settings` is the
 * list, a section is its page with a way back.
 */
export function SettingsDialog({ account, error }: { account: Account; error: string | null }) {
  const { section: param } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const background = settingsBackground(location)!;
  const known = settingsSections.find((s) => s.id === param);
  const shown = known ?? settingsSections[0];
  const results = searchSettings(query);
  const go = (to: To) => navigate(to, { replace: true, state: location.state });
  const close = () => navigate(background);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => { dialog.current?.querySelector(".settings-pane")?.scrollTo(0, 0); }, [shown.id]);

  // Old anchors (`/settings#import`) and unknown sections land on a real page.
  if (!param && legacyHash[location.hash]) return <Navigate to={legacySettingsPath(location.hash)} replace state={location.state} />;
  if (param && !known) return <Navigate to="/settings/account" replace state={location.state} />;

  const submit = (event: FormEvent) => { event.preventDefault(); if (results[0]) go(`/settings/${results[0].section.id}`); };
  return <div className="dialog-backdrop settings-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="settings-page-title" tabIndex={-1}
      className="settings-dialog" data-section={param ? "open" : undefined}
      onKeyDown={(event) => { if (event.key === "Escape" && (event.target as Element).closest('[role="dialog"]') === dialog.current) close(); }}>
      <nav className="settings-nav" aria-label="Settings">
        <div className="settings-nav-head"><h2 className="settings-title">Settings</h2>
          <button type="button" className="icon-button settings-close-narrow" aria-label="Close settings" onClick={close}><X /></button></div>
        <form role="search" onSubmit={submit}>
          <label className="search-field settings-search"><Search aria-hidden="true" />
            <input type="search" aria-label="Search settings" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </form>
        <ul className="settings-nav-list">
          {results.map(({ section, matches }) => <li key={section.id}>
            <Link to={`/settings/${section.id}`} replace state={location.state} className="settings-nav-item"
              aria-current={section.id === shown.id ? "page" : undefined}>
              {icons[section.id]}<span>{section.name}{matches.length > 0 && <small className="settings-match">{matches.join(", ")}</small>}</span>
            </Link></li>)}
          {results.length === 0 && <li className="setting-hint settings-empty">No settings match “{query.trim()}”.</li>}
        </ul>
      </nav>
      <section className="settings-pane" aria-labelledby="settings-page-title">
        <header className="settings-pane-head">
          <button type="button" className="icon-button settings-back" aria-label="All settings" onClick={() => go("/settings")}><ChevronLeft /></button>
          <h1 id="settings-page-title" className="settings-title">{shown.name}</h1>
          <button type="button" className="icon-button" aria-label="Close settings" onClick={close}><X /></button>
        </header>
        <div className="settings-page settings-body">
          {error && <p className="error" role="alert">{error}</p>}
          {sectionBody(shown.id, account)}
        </div>
      </section>
    </div>
  </div>;
}
