import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { session } from "./runtime";
import { GoogleButton } from "./google";
import { Shell, TaskScreen, TodayScreen } from "./shell";
import type { Account } from "./session";
import { RambleScreen } from "./ramble-screen";
import { UpcomingScreen } from "./schedule-screens";
import { ProjectScreen, ProjectsScreen } from "./project-screens";
import { GoalScreen, PastSeasonScreen, SeasonScreen } from "./goal-screens";
import { UiGallery } from "./ui-gallery";
import { FilterScreen, InboxScreen, LabelScreen, MetadataScreen } from "./metadata-screens";
import { ComposerChoicesProvider, SmartDatesProvider } from "./settings-screen";
import { SearchScreen } from "./search-screens";
import { ImportPrompt } from "./import-screen";
import { isSettingsPath, legacySettingsPath, settingsBackground } from "./settings-nav";
import { SettingsDialog } from "./settings-dialog";

export default function App() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void session.refresh();
    void session.resumeGoogle();
    const refresh = () => { if (document.visibilityState === "visible") void session.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  useEffect(() => { if (state.account) setPassword(""); }, [state.account]);
  useEffect(() => {
    if (!state.account) return;
    const remaining = new Date(state.account.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => void session.refresh(), Math.max(0, Math.min(remaining + 100, 2_147_483_647)));
    return () => window.clearTimeout(timer);
  }, [state.account]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    await session.authenticate(mode, { name, email, password });
    setPending(false);
  }

  // Signed-out screens leave the URL untouched, so a requested route opens after sign-in.
  if (state.status === "signed-in" && state.account) {
    const account = state.account;
    return <BrowserRouter><SmartDatesProvider userId={account.user.id}><ComposerChoicesProvider userId={account.user.id}>
      <SignedIn account={account} error={state.error} />
    </ComposerChoicesProvider></SmartDatesProvider></BrowserRouter>;
  }

  return <main className="centered"><section className="account-panel" aria-busy={pending || state.status === "loading"}>
    {state.status === "loading" ? <p role="status">Loading your account…</p> : state.status === "error" ? <>
      <h1>Account unavailable</h1><p role="alert">{state.error}</p>
      <button onClick={() => void session.refresh()}>Try again</button>
    </> : <>
      <header><h1>{mode === "signIn" ? "Sign in" : "Create an account"}</h1><p>{mode === "signIn" ? "Welcome back to todalo." : "Start organizing your tasks with todalo."}</p></header>
      <form onSubmit={submit}>
        {mode === "signUp" && <label>Name<input name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required disabled={pending}/></label>}
        <label>Email<input name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={pending}/></label>
        <label>Password<input name="password" type="password" autoComplete={mode === "signIn" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required disabled={pending}/></label>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>{pending ? "Please wait…" : mode === "signIn" ? "Sign in" : "Sign up"}</button>
      </form>
      <GoogleButton intent="sign-in" disabled={pending} />
      <p className="switch-mode">{mode === "signIn" ? "Don't have an account? " : "Already have an account? "}<button className="text-button" disabled={pending} onClick={() => { session.clearError(); setMode(mode === "signIn" ? "signUp" : "signIn"); }}>{mode === "signIn" ? "Sign up" : "Sign in"}</button></p>
    </>}
  </section></main>;
}

/** The app's screens; `/settings/*` opens the settings modal over the screen it came from. */
function SignedIn({ account, error }: { account: Account; error: string | null }) {
  const location = useLocation();
  const settings = isSettingsPath(location.pathname);
  return <>
    <Routes location={settings ? settingsBackground(location) : location}>
      <Route element={<Shell account={account} />}>
        <Route path="/inbox" element={<InboxScreen account={account} />} />
        <Route path="/today" element={<TodayScreen account={account} />} />
        <Route path="/upcoming" element={<UpcomingScreen account={account} />} />
        <Route path="/tasks/:id" element={<TaskScreen account={account} />} />
        <Route path="/goals/:id" element={<GoalScreen account={account} />} />
        <Route path="/season" element={<SeasonScreen account={account} />} />
        <Route path="/season/:id" element={<PastSeasonScreen account={account} />} />
        <Route path="/projects" element={<ProjectsScreen account={account} />} />
        <Route path="/projects/:id" element={<ProjectScreen account={account} />} />
        <Route path="/labels" element={<MetadataScreen account={account} />} />
        <Route path="/labels/:id" element={<LabelScreen account={account} />} />
        <Route path="/filters" element={<MetadataScreen account={account} />} />
        <Route path="/filters/:id" element={<FilterScreen account={account} />} />
        {/* Legacy /account (and its #import, #keyboard-shortcuts anchors) is now Settings. */}
        <Route path="/account" element={<Navigate to={legacySettingsPath(location.hash)} replace />} />
        <Route path="/ramble" element={<RambleScreen />} />
        <Route path="/search" element={<SearchScreen account={account} />} />
        <Route path="/ui" element={<UiGallery />} />
        {/* /home and unknown routes redirect to Today. */}
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
    {settings && <Routes>
      <Route path="/settings/:section?" element={<SettingsDialog account={account} error={error} />} />
      <Route path="*" element={null} />
    </Routes>}
    <ImportPrompt userId={account.user.id} />
  </>;
}
