import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { session } from "./runtime";
import { AccountScreen, Shell, TaskScreen, TodayScreen } from "./shell";

export default function App() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void session.refresh();
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
    return <BrowserRouter><Routes>
      <Route element={<Shell account={account} />}>
        <Route path="/today" element={<TodayScreen account={account} />} />
        <Route path="/tasks/:id" element={<TaskScreen account={account} />} />
        <Route path="/account" element={<AccountScreen account={account} error={state.error} />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes></BrowserRouter>;
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
      <p className="switch-mode">{mode === "signIn" ? "Don't have an account? " : "Already have an account? "}<button className="text-button" disabled={pending} onClick={() => { session.clearError(); setMode(mode === "signIn" ? "signUp" : "signIn"); }}>{mode === "signIn" ? "Sign up" : "Sign in"}</button></p>
    </>}
  </section></main>;
}
