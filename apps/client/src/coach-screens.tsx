import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coach, coachReads } from "./runtime";
import {
  coachKeys, coachMutations, coachProviderInfo, coachProviderKinds, ollamaDefaultUrl, ollamaUrl,
  type ChatgptDto, type ChatgptStartDto, type CoachDto, type CoachProviderDto, type CoachProviderKind, type CoachTestResult,
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
  const [method, setMethod] = useState<OpenaiMethod>(state.chatgpt || !saved ? "chatgpt" : "key");
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
    {signIn ? <ChatgptSignIn userId={userId} chatgpt={state.chatgpt} /> : <form className="flex flex-col gap-3" onSubmit={submit}>
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

type Waiting = Required<Pick<ChatgptStartDto, "mode">> & { authorizeUrl: string };

/**
 * Ticket 18: ChatGPT sign-in on OpenAI's page (coach-chatgpt.ts). The Mac app
 * opens the browser and waits for it on 127.0.0.1; the web opens a tab and
 * either watches for the API callback (localhost) or takes the pasted address.
 */
function ChatgptSignIn({ userId, chatgpt }: { userId: string; chatgpt: ChatgptDto | null }) {
  const cache = useQueryClient();
  const writes = coachMutations(coach, cache, userId);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [pasted, setPasted] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [model, setModel] = useState(chatgpt?.model ?? coachProviderInfo.chatgpt.model);
  const done = (result: { status: string; message?: string }) => { setWaiting(null); setMessage(result.status === "signed_in" ? null : result.message ?? "The sign-in failed. Start again."); };
  const start = useMutation({
    mutationFn: () => coach.startChatgpt(),
    onSuccess: (result) => {
      setMessage(result.message ?? null);
      if (!result.authorizeUrl || !result.mode) return;
      setPasted("");
      setWaiting({ authorizeUrl: result.authorizeUrl, mode: result.mode });
      // The Mac app already opened the browser.
      if (result.mode !== "loopback") coach.openChatgpt(result.authorizeUrl);
    },
    meta: { action: () => "start the ChatGPT sign-in" },
  });
  const paste = useMutation({ mutationFn: writes.completeChatgpt, onSuccess: done, meta: { action: () => "finish the ChatGPT sign-in" } });
  const saveModel = useMutation({ mutationFn: writes.saveChatgptModel, meta: { action: () => "save the ChatGPT model" } });
  const signOut = useMutation({ mutationFn: writes.signOutChatgpt, meta: { action: () => "sign out of ChatGPT" } });
  const pending = start.isPending || paste.isPending || saveModel.isPending || signOut.isPending;

  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    // Mac: one call that returns when the browser came back (or after 10 minutes).
    if (waiting.mode === "loopback") void writes.finishChatgpt().then(result => { if (!stopped) done(result); }, () => { if (!stopped) done({ status: "failed" }); });
    // Web on localhost: the API callback signs in; Settings rereads the Coach until it shows.
    const timer = waiting.mode === "callback" ? setInterval(() => void cache.invalidateQueries({ queryKey: coachKeys.provider(userId) }), 2_000) : undefined;
    return () => { stopped = true; clearInterval(timer); };
    // Restarts only for a new sign-in.
  }, [waiting]);

  const error = message ?? start.error?.message ?? paste.error?.message ?? saveModel.error?.message ?? signOut.error?.message;
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
    </> : waiting ? <>
      <p className="text-sm" aria-live="polite">{waiting.mode === "paste"
        ? "Sign in on OpenAI's page and allow sharing of your ChatGPT plan with todalo. OpenAI then sends your browser to an address starting with http://127.0.0.1 that cannot load. Copy that whole address and paste it here."
        : "Sign in on OpenAI's page in your browser and allow sharing of your ChatGPT plan with todalo. This page updates when you are done."}</p>
      {waiting.mode === "paste" && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (pasted.trim()) paste.mutate(pasted.trim()); }}>
        <Field>
          <FieldLabel htmlFor="coach-chatgpt-return">Address from the browser</FieldLabel>
          <Input id="coach-chatgpt-return" className="max-w-sm" value={pasted} disabled={pending} autoComplete="off" placeholder="http://127.0.0.1:…/auth/callback?code=…" maxLength={16_384}
            onChange={event => setPasted(event.target.value)} />
        </Field>
        <div><Button type="submit" data-coach-action="chatgpt-finish" disabled={pending || !pasted.trim()}>{paste.isPending ? "Finishing…" : "Finish sign-in"}</Button></div>
      </form>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={waiting.mode === "paste" ? "outline" : "default"} data-coach-action="chatgpt-open" onClick={() => coach.openChatgpt(waiting.authorizeUrl)}>Open OpenAI sign-in again</Button>
        <Button type="button" variant="ghost" onClick={() => { setWaiting(null); setMessage(null); }}>Cancel</Button>
      </div>
    </> : <>
      {chatgpt?.status === "expired" && <FormError>ChatGPT signed you out. Sign in again; until then the Coach uses your API key, if any.</FormError>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-coach-action="chatgpt-sign-in" disabled={pending} onClick={() => { setMessage(null); start.mutate(); }}>
          {start.isPending ? "Starting…" : "Sign in with ChatGPT"}</Button>
        {chatgpt && <Button type="button" variant="ghost" data-coach-action="chatgpt-sign-out" disabled={pending} onClick={() => signOut.mutate()}>Forget ChatGPT sign-in</Button>}
      </div>
      <Hint>Runs the Coach on your ChatGPT plan instead of an API key. OpenAI asks you to allow sharing of your plan with todalo; usage counts against your plan. OpenAI has not published this sign-in for other apps, so it may change or stop working; an API key keeps the Coach running.</Hint>
    </>}
    {error && <FormError>{error}</FormError>}
  </div>;
}
