import { AccountTransportError } from "./errors";

export interface Account {
  user: { id: string; name: string; email: string; image: string | null; emailVerified: boolean };
  expiresAt: string;
  /** The member badge: place in sign-up order, join date (ISO), founding member. */
  member?: { number: number; since: string; founding: boolean };
}

export interface Credentials { email: string; password: string }
export interface AccountTransport {
  account(): Promise<Account | null>;
  signIn(credentials: Credentials): Promise<Account>;
  signUp(credentials: Credentials & { name: string }): Promise<Account>;
  signOut(): Promise<void>;
  /** Deletes the account and all its data; `password` is needed unless the session is under a day old. */
  deleteAccount(password?: string): Promise<void>;
}

export type GoogleIntent = "sign-in" | "link";
export interface GoogleOutcome { account: Account; linked: boolean }
/** System-browser Google flow. No method ever carries a code, token or URL. */
export interface GoogleTransport {
  startGoogle(intent: GoogleIntent): Promise<void>;
  /** Resolves when a pending flow returns; null when none is pending. */
  finishGoogle(): Promise<GoogleOutcome | null>;
  cancelGoogle(): Promise<void>;
}

interface SessionState {
  status: "loading" | "signed-in" | "signed-out" | "error";
  account: Account | null;
  error: string | null;
}

const transient = new Set(["CONNECTION_FAILED", "ACCOUNT_UNAVAILABLE"]);

/** Where the last signed-in account is kept between launches (only its own fields, never a token). */
export interface RememberedAccount { load(): Account | null; save(account: Account | null): void }
export function rememberedAccount(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage, key = "todalo.account"): RememberedAccount {
  return {
    load() { try { const value = JSON.parse(storage.getItem(key) ?? "null") as Account | null; return value?.user?.id ? value : null; } catch { return null; } },
    save(account) { try { if (account) storage.setItem(key, JSON.stringify(account)); else storage.removeItem(key); } catch { /* not remembered */ } },
  };
}

export class SessionController {
  private state: SessionState = { status: "loading", account: null, error: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private mutationCount = 0;

  // Kept apart from `state` so an account refresh racing the browser return
  // (focus/visibility fire as the app reopens) cannot wipe a Google error.
  private googlePending = false;
  private googleError: string | null = null;

  /**
   * `remembered`: a launch opens signed in as the last account (its cached screens show at once)
   * while `refresh` asks the server; a rejected session signs out as before.
   */
  constructor(private transport: AccountTransport, private clearUserCache: () => void, private google?: GoogleTransport, private remembered?: RememberedAccount, now = Date.now()) {
    const account = remembered?.load();
    if (account && new Date(account.expiresAt).getTime() > now) this.state = { status: "signed-in", account, error: null };
  }

  getSnapshot = () => this.state;
  getGooglePending = () => this.googlePending;
  getGoogleError = () => this.googleError;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(state: SessionState) {
    this.state = state;
    if (state.status !== "loading") this.remembered?.save(state.status === "signed-in" ? state.account : null);
    for (const listener of this.listeners) listener();
  }

  clearError() { this.googleError = null; this.update({ ...this.state, error: null }); }

  async refresh() {
    if (this.mutationCount > 0) return;
    const generation = ++this.generation;
    try {
      const account = await this.transport.account();
      if (generation !== this.generation) return;
      if (account?.user.id !== this.state.account?.user.id || !account) this.clearUserCache();
      this.update({ status: account ? "signed-in" : "signed-out", account, error: null });
    } catch (error) {
      // Not reaching the server says nothing about the session: a signed-in UI
      // stays (with its cache and open drafts) and the connection status shows.
      if (generation === this.generation && this.state.account && error instanceof AccountTransportError && transient.has(error.code)) return;
      if (generation === this.generation) {
        this.clearUserCache();
        this.update({ status: "error", account: null, error: error instanceof AccountTransportError ? error.message : "Cannot reach todalo. Check your connection and try again." });
      }
    }
  }

  async authenticate(mode: "signIn" | "signUp", credentials: Credentials & { name: string }) {
    this.mutationCount++;
    const generation = ++this.generation;
    this.clearUserCache();
    try {
      const account = await (mode === "signIn" ? this.transport.signIn(credentials) : this.transport.signUp(credentials));
      if (generation === this.generation) this.update({ status: "signed-in", account, error: null });
    } catch (error) {
      if (generation === this.generation) this.update({ status: "signed-out", account: null, error: error instanceof AccountTransportError ? error.message : "Sign-in failed. Try again." });
    } finally {
      this.mutationCount--;
    }
  }

  async signOut() {
    this.mutationCount++;
    const generation = ++this.generation;
    this.clearUserCache();
    try {
      await this.transport.signOut();
      if (generation === this.generation) this.update({ status: "signed-out", account: null, error: null });
    } catch (error) {
      if (generation === this.generation) this.update({ ...this.state, error: error instanceof AccountTransportError ? error.message : "Sign-out could not reach the server. Try again to revoke this session." });
    } finally {
      this.mutationCount--;
    }
  }

  /** Deletes the account for good. Resolves to an error message to show, or null once signed out. */
  async deleteAccount(password?: string): Promise<string | null> {
    this.mutationCount++;
    try {
      await this.transport.deleteAccount(password);
      ++this.generation;
      this.clearUserCache();
      this.update({ status: "signed-out", account: null, error: null });
      return null;
    } catch (error) {
      return error instanceof AccountTransportError ? error.message : "Your account could not be deleted. Try again.";
    } finally {
      this.mutationCount--;
    }
  }

  /** Opens the system browser, then waits until the handoff reopens the app. */
  async continueWithGoogle(intent: GoogleIntent) {
    if (!this.google || this.googlePending) return;
    this.googlePending = true;
    this.googleError = null;
    this.update({ ...this.state });
    try {
      await this.google.startGoogle(intent);
      this.settleGoogle(await this.google.finishGoogle());
    } catch (error) {
      this.failGoogle(error);
    } finally {
      this.googlePending = false;
      this.update({ ...this.state });
    }
  }

  /** Cold start: finishes a flow begun before the app was closed, if any. */
  async resumeGoogle() {
    if (!this.google) return;
    try { this.settleGoogle(await this.google.finishGoogle()); }
    catch (error) { this.failGoogle(error); }
  }

  async cancelGoogle() {
    try { await this.google?.cancelGoogle(); }
    catch (error) { this.failGoogle(error); }
  }

  private settleGoogle(outcome: GoogleOutcome | null) {
    if (!outcome) return;
    // Supersede account reads that started before the handoff completed.
    ++this.generation;
    if (outcome.account.user.id !== this.state.account?.user.id) this.clearUserCache();
    this.googleError = null;
    this.update({ status: "signed-in", account: outcome.account, error: null });
  }

  private failGoogle(error: unknown) {
    // Leaving Google on purpose is not an error; everything else keeps the
    // current account and shows only known recovery copy.
    this.googleError = !(error instanceof AccountTransportError) ? "Google sign-in could not be completed. Try again."
      : error.code === "GOOGLE_CANCELLED" ? null : error.message;
    this.update({ ...this.state });
  }
}
