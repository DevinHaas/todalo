import { AccountTransportError } from "./errors";

export interface Account {
  user: { id: string; name: string; email: string; image: string | null; emailVerified: boolean };
  expiresAt: string;
}

export interface Credentials { email: string; password: string }
export interface AccountTransport {
  account(): Promise<Account | null>;
  signIn(credentials: Credentials): Promise<Account>;
  signUp(credentials: Credentials & { name: string }): Promise<Account>;
  signOut(): Promise<void>;
}

interface SessionState {
  status: "loading" | "signed-in" | "signed-out" | "error";
  account: Account | null;
  error: string | null;
}

export class SessionController {
  private state: SessionState = { status: "loading", account: null, error: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private mutationCount = 0;

  constructor(private transport: AccountTransport, private clearUserCache: () => void) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(state: SessionState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  clearError() { this.update({ ...this.state, error: null }); }

  async refresh() {
    if (this.mutationCount > 0) return;
    const generation = ++this.generation;
    try {
      const account = await this.transport.account();
      if (generation !== this.generation) return;
      if (account?.user.id !== this.state.account?.user.id || !account) this.clearUserCache();
      this.update({ status: account ? "signed-in" : "signed-out", account, error: null });
    } catch (error) {
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
}
