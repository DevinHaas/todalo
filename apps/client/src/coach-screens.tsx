import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coach, coachReads } from "./runtime";
import {
  coachMutations, coachProviderInfo, coachProviderKinds, ollamaDefaultUrl, ollamaUrl,
  type ChatgptDto, type ChatgptSignInDto, type CoachDto, type CoachProviderDto, type CoachProviderKind, type CoachTestResult,
} from "./coach";
import { FormError, LoadFailure, Loading } from "./goal-views";
import { Badge, Button, Field, FieldDescription, FieldLabel, Hint, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ToggleGroup, ToggleGroupItem } from "./ui";

/**
 * Goals tickets 17, 17b and 18: Settings › Coach. Connect an AI provider by API
 * key (OpenAI, Anthropic, OpenRouter) or a local Ollama model, or sign in with
 * ChatGPT; test it, disconnect or sign out.
 */
export function CoachSettingsScreen({ userId }: { userId: string }) {
  const query = useQuery(coachReads.provider(userId));
  if (query.status === "pending") return <div className="ui"><Loading>Loading the Coach…</Loading></div>;
  if (!query.data) return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  return <CoachSettings key={JSON.stringify(query.data)} userId={userId} coach={query.data} />;
}

type OpenaiMethod = "chatgpt" | "key";

function CoachSettings({ userId, coach: state }: { userId: string; coach: CoachDto }) {
  const saved = state.keyProvider;
  const cache = useQueryClient();
  const writes = coachMutations(coach, cache, userId);
  // OpenAI offers both its ChatGPT sign-in and an API key; a sign-in (even expired) opens on its tab.
  const [method, setMethod] = useState<OpenaiMethod>(state.chatgpt || (!saved && state.chatgptAvailable) ? "chatgpt" : "key");
  const [provider, setProvider] = useState<CoachProviderKind>(state.chatgpt ? "openai" : (saved?.provider as CoachProviderKind | undefined) ?? "openai");
  const [model, setModel] = useState(saved?.model ?? coachProviderInfo.openai.model);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? ollamaDefaultUrl);
  const [check, setCheck] = useState<string | null>(null);
  const [tested, setTested] = useState<CoachTestResult | null>(null);
  const save = useMutation({ mutationFn: writes.save, meta: { action: () => "connect the AI provider" } });
  const disconnect = useMutation({ mutationFn: writes.disconnect, meta: { action: () => "disconnect the AI provider" } });
  const test = useMutation({ mutationFn: writes.test, onSuccess: setTested, meta: { action: () => "test the connection" } });
  const pending = save.isPending || disconnect.isPending || test.isPending;
  const local = provider === "ollama";
  const signIn = provider === "openai" && method === "chatgpt";
  // The saved key is kept when only the model changes.
  const keepsKey = saved?.provider === provider && saved.keyHint !== null;

  function choose(next: CoachProviderKind) {
    setProvider(next);
    setModel(saved?.provider === next ? saved.model : coachProviderInfo[next].model);
    setApiKey("");
    setCheck(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTested(null);
    // Same rules as the server (packages/server/src/coach.ts), so the reason shows on web and Mac alike.
    if (local && !ollamaUrl(baseUrl)) return setCheck("Ollama must run on this computer: use a localhost address.");
    if (!local && !keepsKey && apiKey.trim().length < 8) return setCheck("Enter an API key.");
    setCheck(null);
    await save.mutateAsync({ provider, model: model.trim(), ...local ? { baseUrl: baseUrl.trim() } : apiKey.trim() ? { apiKey: apiKey.trim() } : {} }).catch(() => undefined);
  }

  return <div className="ui flex flex-col gap-4" data-coach-settings="">
    <Hint>The Coach is optional. With an AI provider it explains each goal's status in plain words; everything else works the same without one.</Hint>
    {state.provider && <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-sm" data-coach-connected="">
        <Badge variant="success">Connected</Badge>
        <span><ProviderLine provider={state.provider} /></span>
        <Button type="button" size="sm" variant="outline" data-coach-action="test" disabled={pending} onClick={() => { setTested(null); test.mutate(); }}>
          {test.isPending ? "Testing…" : "Test connection"}</Button>
      </p>
      {state.provider.provider === "chatgpt" && saved && <Hint>If ChatGPT signs you out, the Coach uses <ProviderLine provider={saved} /> instead.</Hint>}
      <div aria-live="polite">
        {tested && (tested.ok ? <p role="status" className="text-xs-plus text-success" data-coach-test="ok">Connected: the model answered.</p>
          : <FormError>{tested.message ?? "The connection failed."}</FormError>)}
        {test.error && <FormError>{test.error.message}</FormError>}
      </div>
    </div>}
    <Field>
      <FieldLabel htmlFor="coach-provider">Provider</FieldLabel>
      <Select items={coachProviderKinds.map(value => ({ value, label: coachProviderInfo[value].label }))} value={provider} disabled={pending}
        onValueChange={(value) => { if (value) choose(value as CoachProviderKind); }}>
        <SelectTrigger id="coach-provider" className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>{coachProviderKinds.map(value => <SelectItem key={value} value={value}>{coachProviderInfo[value].label}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    {provider === "openai" && <ToggleGroup aria-label="How to connect OpenAI" variant="outline" size="sm" value={[method]} disabled={pending}
      onValueChange={(next) => { const value = next[0] as OpenaiMethod | undefined; if (value) setMethod(value); }}>
      <ToggleGroupItem value="chatgpt" className="px-2.5 text-xs-plus" data-coach-method="chatgpt">Sign in with ChatGPT</ToggleGroupItem>
      <ToggleGroupItem value="key" className="px-2.5 text-xs-plus" data-coach-method="key">Use an API key</ToggleGroupItem>
    </ToggleGroup>}
    {signIn ? <ChatgptSignIn userId={userId} chatgpt={state.chatgpt} available={state.chatgptAvailable} /> : <form className="flex flex-col gap-3" onSubmit={submit}>
      {local ? <Field>
        <FieldLabel htmlFor="coach-base-url">Ollama address</FieldLabel>
        <Input id="coach-base-url" className="max-w-sm" value={baseUrl} disabled={pending} onChange={event => setBaseUrl(event.target.value)} required maxLength={500} />
        <FieldDescription>Ollama runs on this computer, so it works only where the todalo server runs locally.</FieldDescription>
      </Field> : <Field>
        <FieldLabel htmlFor="coach-api-key">API key</FieldLabel>
        <Input id="coach-api-key" type="password" autoComplete="off" className="max-w-sm" value={apiKey} disabled={pending} maxLength={500}
          placeholder={keepsKey ? `…${saved!.keyHint} (leave empty to keep)` : keyPlaceholder[provider]} onChange={event => setApiKey(event.target.value)} />
        <FieldDescription>Stored encrypted on the server and never shown again.</FieldDescription>
      </Field>}
      <Field>
        <FieldLabel htmlFor="coach-model">Model</FieldLabel>
        <Input id="coach-model" className="max-w-sm" value={model} disabled={pending} onChange={event => setModel(event.target.value)} required maxLength={200} />
      </Field>
      {(check ?? save.error?.message) && <FormError>{check ?? save.error?.message}</FormError>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" data-coach-action="connect" disabled={pending || !model.trim()}>{saved ? "Save" : "Connect"}</Button>
        {saved && <Button type="button" variant="ghost" data-coach-action="disconnect" disabled={pending} onClick={() => { setTested(null); disconnect.mutate(); }}>
          Disconnect {coachProviderInfo[saved.provider].label}</Button>}
      </div>
      {disconnect.error && <FormError>{disconnect.error.message}</FormError>}
    </form>}
    <Hint>When connected, your goal titles, season targets and status numbers are sent to this provider to write the explanations. Nothing is sent without a provider.</Hint>
  </div>;
}

const keyPlaceholder: Record<CoachProviderKind, string> = { openai: "sk-…", anthropic: "sk-ant-…", openrouter: "sk-or-…", ollama: "" };

function ProviderLine({ provider }: { provider: CoachProviderDto }) {
  return <>{coachProviderInfo[provider.provider].label} · {provider.model}{provider.keyHint && <span className="text-muted-foreground"> · key …{provider.keyHint}</span>}</>;
}

/**
 * Ticket 18: ChatGPT sign-in with OpenAI's device code. Start shows a code to
 * enter on OpenAI's page; this polls at OpenAI's interval until the user approved.
 */
function ChatgptSignIn({ userId, chatgpt, available }: { userId: string; chatgpt: ChatgptDto | null; available: boolean }) {
  const cache = useQueryClient();
  const writes = coachMutations(coach, cache, userId);
  const [code, setCode] = useState<ChatgptSignInDto["signIn"]>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [model, setModel] = useState(chatgpt?.model ?? coachProviderInfo.chatgpt.model);
  const start = useMutation({
    mutationFn: () => coach.startChatgpt(),
    onSuccess: (result) => { setCode(result.signIn); setMessage(result.message ?? null); },
    meta: { action: () => "start the ChatGPT sign-in" },
  });
  const saveModel = useMutation({ mutationFn: writes.saveChatgptModel, meta: { action: () => "save the ChatGPT model" } });
  const signOut = useMutation({ mutationFn: writes.signOutChatgpt, meta: { action: () => "sign out of ChatGPT" } });
  const pending = start.isPending || saveModel.isPending || signOut.isPending;

  useEffect(() => {
    if (!code) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const next = () => { timer = setTimeout(() => void writes.pollChatgpt().then(result => {
      if (stopped) return;
      if (result.status === "pending") { setMessage(result.message ?? null); return next(); }
      setCode(null);
      setMessage(result.status === "failed" ? result.message ?? "The sign-in failed. Start again." : null);
    }, () => { if (!stopped) next(); }), code.intervalSeconds * 1000); };
    next();
    return () => { stopped = true; clearTimeout(timer); };
    // Polling restarts only for a new code.
  }, [code]);

  if (!available && !chatgpt) return <Hint>This server does not offer ChatGPT sign-in yet. Use an API key instead.</Hint>;
  const error = message ?? start.error?.message ?? saveModel.error?.message ?? signOut.error?.message;
  return <div className="flex flex-col gap-3" data-coach-chatgpt="">
    {chatgpt?.status === "signed_in" ? <>
      <p className="text-sm">Signed in with ChatGPT{chatgpt.email && <span className="text-muted-foreground"> as {chatgpt.email}</span>}. The Coach uses your ChatGPT plan.</p>
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); saveModel.mutate(model.trim()); }}>
        <Field>
          <FieldLabel htmlFor="coach-chatgpt-model">Model</FieldLabel>
          <Input id="coach-chatgpt-model" className="max-w-sm" value={model} disabled={pending} onChange={event => setModel(event.target.value)} required maxLength={200} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !model.trim() || model.trim() === chatgpt.model}>Save</Button>
          <Button type="button" variant="ghost" data-coach-action="chatgpt-sign-out" disabled={pending} onClick={() => signOut.mutate()}>Sign out of ChatGPT</Button>
        </div>
      </form>
    </> : code ? <>
      <p className="text-sm">Open OpenAI's sign-in page, sign in to ChatGPT and enter this code:</p>
      <p className="font-mono text-lg tracking-widest" data-chatgpt-code="" aria-live="polite">{code.userCode}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-coach-action="chatgpt-open" onClick={() => coach.openChatgpt()}>Open OpenAI sign-in</Button>
        <Button type="button" variant="ghost" onClick={() => { setCode(null); setMessage(null); }}>Cancel</Button>
      </div>
      <Hint>Waiting for you to approve at {code.verificationUrl.replace("https://", "")}. The code is good for 15 minutes.</Hint>
    </> : <>
      {chatgpt?.status === "expired" && <FormError>ChatGPT signed you out. Sign in again; until then the Coach uses your API key, if any.</FormError>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-coach-action="chatgpt-sign-in" disabled={pending} onClick={() => { setMessage(null); start.mutate(); }}>
          {start.isPending ? "Starting…" : "Sign in with ChatGPT"}</Button>
        {chatgpt && <Button type="button" variant="ghost" data-coach-action="chatgpt-sign-out" disabled={pending} onClick={() => signOut.mutate()}>Forget ChatGPT sign-in</Button>}
      </div>
      <Hint>Runs the Coach on your ChatGPT plan instead of an API key. OpenAI does not officially support this for other apps, so it may stop working; an API key keeps the Coach running.</Hint>
    </>}
    {error && <FormError>{error}</FormError>}
  </div>;
}
