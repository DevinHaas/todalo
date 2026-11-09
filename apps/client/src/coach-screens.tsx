import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Asterisk, ChevronDown, Cpu, MessageCircle, Route, Sparkles } from "lucide-react";
import { coach, coachReads, settings, settingsReads } from "./runtime";
import { settingsMutations } from "./settings";
import { SettingSwitch } from "./settings-views";
import {
  coachCardKinds, coachKeys, coachMutations, coachProviderInfo, ollamaDefaultUrl, ollamaUrl, sortedCoachProviders,
  type ChatgptDto, type ChatgptStartDto, type CoachDto, type CoachModelKind, type CoachModelOption, type CoachModelsDraft, type CoachProviderDto, type CoachProviderKind, type CoachTestResult,
} from "./coach";
import { modelTag, modelTagLabels } from "../../../packages/server/src/coach-models";
import { FormError, LoadFailure, Loading } from "./goal-views";
import { CoachPatterns } from "./pattern-screens";
import {
  Button, Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList, ComboboxTrigger,
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, Field, FieldDescription, FieldLabel, Hint, Input, cn,
} from "./ui";

/**
 * Goals tickets 17, 17b, 18 and 17c: Settings › Coach. A card per provider
 * (ChatGPT sign-in, API keys for OpenAI, Anthropic and OpenRouter, a local
 * Ollama model), several configured at once, and a picker for the one the
 * Coach uses.
 */
export function CoachSettingsScreen({ userId }: { userId: string }) {
  const query = useQuery(coachReads.provider(userId));
  // Outside the keyed settings, so an open card stays open when the data changes.
  const [open, setOpen] = useState<CoachModelKind | null>(null);
  if (query.status === "pending") return <div className="ui"><Loading>Loading the Coach…</Loading></div>;
  if (!query.data) return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  return <CoachSettings userId={userId} coach={query.data} open={open} setOpen={setOpen} />;
}

/** ChatGPT first: it needs no key. */
const cardKinds = coachCardKinds;
const cardLabel: Record<CoachModelKind, string> = { ...Object.fromEntries(cardKinds.map(kind => [kind, coachProviderInfo[kind].label])) as Record<CoachModelKind, string>, ollama: "Ollama" };
const marks: Record<CoachModelKind, { icon: ReactNode; className: string }> = {
  chatgpt: { icon: <MessageCircle />, className: "bg-provider-chatgpt" },
  openai: { icon: <Sparkles />, className: "bg-provider-openai" },
  anthropic: { icon: <Asterisk />, className: "bg-provider-anthropic" },
  openrouter: { icon: <Route />, className: "bg-provider-openrouter" },
  ollama: { icon: <Cpu />, className: "bg-provider-ollama" },
};

/** The brand icon on a coloured rounded square (theme.css --color-provider-*). */
function ProviderMark({ kind, size = "md" }: { kind: CoachModelKind; size?: "sm" | "md" }) {
  return <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center text-provider-foreground", marks[kind].className,
    size === "md" ? "size-8 rounded-lg [&_svg]:size-4.5" : "size-6 rounded-md [&_svg]:size-3.5")}>{marks[kind].icon}</span>;
}

interface Configured { kind: CoachModelKind; dto: CoachProviderDto | null; usable: boolean }

/** Every configured provider (the ChatGPT sign-in too, even expired), for the cards and the picker. */
function configured(state: CoachDto): Configured[] {
  const keyed = sortedCoachProviders(state).map(dto => ({ kind: dto.provider, dto, usable: !coachProviderInfo[dto.provider].needsKey || dto.keyHint !== null }));
  const chatgpt = state.chatgpt && { kind: "chatgpt" as const, dto: { provider: "chatgpt" as const, model: state.chatgpt.model, baseUrl: null, keyHint: null }, usable: state.chatgpt.status === "signed_in" };
  return chatgpt ? [chatgpt, ...keyed] : keyed;
}

function statusLine(kind: CoachModelKind, state: CoachDto): string {
  if (kind === "chatgpt") {
    if (!state.chatgpt) return "Sign in to use your ChatGPT plan";
    if (state.chatgpt.status === "expired") return "Sign-in expired";
    return [`Signed in${state.chatgpt.email ? ` as ${state.chatgpt.email}` : ""}`, state.chatgpt.model].join(" · ");
  }
  const saved = state.providers.find(item => item.provider === kind);
  if (!saved) return kind === "ollama" ? "Add a local model to set up" : "Add API key to set up";
  if (kind === "ollama") return ["Connected", saved.model, saved.baseUrl].filter(Boolean).join(" · ");
  if (!saved.keyHint) return "Enter your API key again";
  return `Connected · key …${saved.keyHint} · ${saved.model}`;
}

function CoachSettings({ userId, coach: state, open, setOpen }: { userId: string; coach: CoachDto; open: CoachModelKind | null; setOpen: (kind: CoachModelKind | null) => void }) {
  const set = configured(state);
  return <div className="ui flex flex-col gap-4" data-coach-settings="">
    <Hint>The Coach is optional. With an AI provider it explains each goal's status in plain words; everything else works the same without one.</Hint>
    {set.length > 0 && <ActivePicker userId={userId} state={state} configured={set} />}
    <ul className="flex flex-col gap-2" aria-label="AI providers">
      {cardKinds.map(kind => {
        const isOpen = open === kind;
        const set_up = set.some(item => item.kind === kind);
        return <li key={kind} className="rounded-lg border border-border bg-card text-card-foreground" data-coach-card={kind}>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <ProviderMark kind={kind} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{cardLabel[kind]}</p>
              <p className={cn("truncate text-xs-plus", statusLine(kind, state) === "Sign-in expired" ? "text-destructive" : "text-muted-foreground")} data-coach-status={kind}>{statusLine(kind, state)}</p>
            </div>
            <Button type="button" variant={set_up ? "outline" : "default"} size="sm" aria-expanded={isOpen} aria-controls={`coach-card-${kind}`}
              data-coach-configure={kind} onClick={() => setOpen(isOpen ? null : kind)}>{isOpen ? "Close" : set_up ? "Manage" : "Configure"}</Button>
          </div>
          {isOpen && <div id={`coach-card-${kind}`} className="border-t border-border-subtle px-3 py-3">
            {kind === "chatgpt"
              ? <ChatgptSignIn key={JSON.stringify(state.chatgpt)} userId={userId} chatgpt={state.chatgpt} />
              : <KeyForm key={JSON.stringify(state.providers.find(item => item.provider === kind) ?? null)} userId={userId} kind={kind} saved={state.providers.find(item => item.provider === kind) ?? null} />}
          </div>}
        </li>;
      })}
    </ul>
    <CoachPatterns userId={userId} connected={state.provider !== null} />
    <EventTitlesSetting userId={userId} />
    <Hint>When connected, your goal titles, season targets and status numbers (and your patterns) are sent to the active provider to write the explanations. Nothing is sent without a provider.</Hint>
  </div>;
}

/** Ticket 28: calendar events are busy time for the Coach's drafts; their titles go to the provider only when this is on. */
function EventTitlesSetting({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const query = useQuery(settingsReads.settings(userId));
  const update = useMutation(useMemo(() => settingsMutations(settings, cache, userId).update, [cache, userId]));
  if (!query.data) return null;
  return <SettingSwitch title="Share event titles with the AI" checked={query.data.shareEventTitles} disabled={update.isPending}
    hint="Off: the Coach only sees when your calendar events make you busy. On: their titles are sent to the active provider too."
    onChange={(shareEventTitles) => update.mutate({ ...query.data, shareEventTitles })} />;
}

/**
 * Ticket 17c: the pill at the top, like a model picker: the active provider's
 * mark, "Coach model", "Provider · model". Lists only configured providers;
 * one that cannot run is shown but disabled. A quiet note when the Coach fell back.
 */
function ActivePicker({ userId, state, configured: set }: { userId: string; state: CoachDto; configured: Configured[] }) {
  const cache = useQueryClient();
  const writes = coachMutations(coach, cache, userId);
  const [tested, setTested] = useState<CoachTestResult | null>(null);
  const pick = useMutation({ mutationFn: writes.setActive, onMutate: () => setTested(null), meta: { action: () => "switch the Coach's provider" } });
  const test = useMutation({ mutationFn: () => writes.test(), onSuccess: setTested, meta: { action: () => "test the connection" } });
  const running = state.provider;
  const shown = running?.provider ?? state.selected;
  const fellBack = Boolean(state.selected && running?.provider !== state.selected);
  return <div className="flex flex-col gap-2" data-coach-active="">
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger disabled={pick.isPending} render={<Button type="button" variant="outline" className="h-auto min-h-13 gap-3 rounded-full py-2 pr-3.5 pl-2" data-coach-picker="" aria-label="Coach model" />}>
          {shown && <ProviderMark kind={shown} />}
          <span className="flex flex-col items-start gap-0.5">
            <span className="text-xs leading-4 font-normal text-muted-foreground">Coach model</span>
            <span className="text-sm leading-5 font-semibold" data-coach-running="">{running ? `${cardLabel[running.provider]} · ${running.model}` : "None can run"}</span>
          </span>
          <ChevronDown className="ml-1 size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-max min-w-80 max-w-[min(32rem,var(--available-width))]">
          <DropdownMenuRadioGroup value={state.selected ?? ""} onValueChange={(value) => { if (value && value !== state.selected) pick.mutate(value as CoachModelKind); }}>
            {set.map(item => <DropdownMenuRadioItem key={item.kind} value={item.kind} disabled={!item.usable} data-coach-pick={item.kind}>
              <ProviderMark kind={item.kind} size="sm" />
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
                <span>{cardLabel[item.kind]}{item.dto && <span className="text-muted-foreground"> · {item.usable ? item.dto.model : item.kind === "chatgpt" ? "sign-in expired" : "key unreadable"}</span>}</span>
                {item.dto && item.usable && <ModelHint kind={item.kind} id={item.dto.model} />}
              </span>
            </DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {running && <Button type="button" size="sm" variant="ghost" data-coach-action="test" disabled={test.isPending} onClick={() => { setTested(null); test.mutate(); }}>
        {test.isPending ? "Testing…" : "Test connection"}</Button>}
    </div>
    {fellBack && state.selected && <Hint data-coach-fallback="">
      {state.selected === "chatgpt" ? "Your ChatGPT sign-in expired" : `${cardLabel[state.selected]} cannot run now`}{running ? `, so the Coach uses ${cardLabel[running.provider]} for now.` : ". Set up another provider below."}
    </Hint>}
    <div aria-live="polite">
      {tested && (tested.ok ? <p role="status" className="text-xs-plus text-success" data-coach-test="ok">Connected: the model answered.</p>
        : <FormError>{tested.message ?? "The connection failed."}</FormError>)}
      {(test.error ?? pick.error) && <FormError>{(test.error ?? pick.error)!.message}</FormError>}
    </div>
  </div>;
}

/** "Recommended" for the provider's default, else the model's short hint (coach-models.ts); nothing for unknown models. */
function hintText(kind: CoachModelKind, id: string, recommended = id === coachProviderInfo[kind].model) {
  const tag = modelTag(kind, id);
  return [recommended && "Recommended", tag && modelTagLabels[tag]].filter(Boolean).join(" · ") || null;
}
function ModelHint({ kind, id }: { kind: CoachModelKind; id: string }) {
  const text = hintText(kind, id);
  return text && <span className="shrink-0 text-xs font-normal text-muted-foreground" data-model-hint="">{text}</span>;
}

const CUSTOM = "\u0000custom";
/** Above this many models the picker gets a search field; OpenRouter always (it lists hundreds, known before they load). */
const SEARCH_FROM = 8;

interface ModelGroup { value: "models" | "older" | "custom"; label: string | null; items: CoachModelOption[] }

/**
 * The model picker: the provider's own list (its saved key or sign-in, or the
 * key typed above), recommended then newest first with a short hint, models
 * over a year old under "Older models", and "Custom model…" to type any id.
 * A configured card asks right away (so it can say a saved model is gone);
 * with a typed key it asks when opened. The curated list when the provider cannot be asked.
 */
function ModelPicker({ id, userId, provider, value, onChange, disabled, draft, saved }: {
  id: string; userId: string; provider: CoachModelKind; value: string; onChange: (model: string) => void; disabled: boolean; draft: CoachModelsDraft;
  /** The model saved for this provider, if any (never changed here). */
  saved?: string;
}) {
  const [asked, setAsked] = useState(false);
  const [custom, setCustom] = useState(false);
  const list = useQuery({
    queryKey: [...coachKeys.all(userId), "models", provider, draft.baseUrl ?? "", draft.apiKey ?? ""],
    // ponytail: an edited Ollama address asks per keystroke (localhost only, cached server-side).
    queryFn: () => coach.models(provider, draft), enabled: asked || (Boolean(saved) && !draft.apiKey), staleTime: 10 * 60_000, retry: false,
  });
  const option = (model: string): CoachModelOption => ({ id: model, tag: modelTag(provider, model), hint: null, recommended: model === coachProviderInfo[provider].model, created: null, older: false });
  const models = list.data?.models ?? [];
  const current = value.trim();
  // The chosen model stays pickable even when the list does not have it.
  const extra = current && !models.some(item => item.id === current) ? [option(current)] : [];
  const groups: ModelGroup[] = ([
    { value: "models", label: null, items: [...extra, ...models.filter(item => !item.older)] },
    { value: "older", label: "Older models", items: models.filter(item => item.older) },
    { value: "custom", label: null, items: [option(CUSTOM)] },
  ] satisfies ModelGroup[]).filter(group => group.items.length > 0);
  const all = groups.flatMap(group => group.items);
  const gone = Boolean(saved && list.data && !list.data.fallback && !models.some(item => item.id === saved));
  const note = gone && <p className="text-xs-plus text-muted-foreground" data-coach-model-gone="">This model is no longer offered — choose another.</p>;
  if (custom) return <div className="flex flex-col gap-1.5">
    <div className="flex max-w-sm items-center gap-2">
      <Input id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} required maxLength={200} autoFocus placeholder={`Model id, e.g. ${coachProviderInfo[provider].model}`} data-coach-model-custom="" />
      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setCustom(false)}>Choose from list</Button>
    </div>
    {note}
  </div>;
  return <div className="flex flex-col gap-1.5">
    <Combobox<CoachModelOption> items={groups} value={all.find(item => item.id === current) ?? null}
      itemToStringLabel={item => item.id === CUSTOM ? "Custom model…" : item.id} isItemEqualToValue={(a, b) => a.id === b.id}
      filter={(item, query) => item.id === CUSTOM || item.id.toLowerCase().includes(query.trim().toLowerCase())}
      onOpenChange={open => { if (open) setAsked(true); }}
      onValueChange={item => { if (!item) return; if (item.id === CUSTOM) setCustom(true); else onChange(item.id); }}>
      <ComboboxTrigger id={id} disabled={disabled} data-coach-model-picker={provider}
        render={<Button type="button" variant="outline" className="w-full max-w-sm justify-between gap-3 font-normal" />}>
        <span className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className="truncate font-medium">{current || "Choose a model"}</span>
          {current && <ModelHint kind={provider} id={current} />}
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="w-(--anchor-width) max-w-(--available-width) min-w-80" data-coach-model-list={provider}>
        {(provider === "openrouter" || all.length > SEARCH_FROM) && <ComboboxInput showTrigger={false} placeholder="Search models" aria-label="Search models" autoFocus />}
        {list.isFetching && <p className="px-2 py-1.5 text-xs text-muted-foreground" role="status">Loading models…</p>}
        {list.data?.fallback && <p className="px-2 py-1.5 text-xs text-muted-foreground" data-coach-models-fallback="">{list.data.message} Showing common models.</p>}
        <ComboboxEmpty className="px-2 py-1.5 text-xs text-muted-foreground empty:hidden">No model matches. Use Custom model…</ComboboxEmpty>
        <ComboboxList>
          {(group: ModelGroup) => <ComboboxGroup key={group.value} items={group.items} data-coach-model-group={group.value}
            className={group.value !== "models" ? "mt-1 border-t border-border-subtle pt-1" : undefined}>
            {group.label && <ComboboxLabel>{group.label}</ComboboxLabel>}
            <ComboboxCollection>
              {(item: CoachModelOption) => <ComboboxItem key={item.id} value={item} data-coach-model={item.id === CUSTOM ? "custom" : item.id}>
                {item.id === CUSTOM ? <span className="text-muted-foreground">Custom model…</span>
                  : <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <span className="truncate">{item.id}</span>
                    {hintText(provider, item.id, item.recommended) && <span className="shrink-0 text-xs font-normal text-muted-foreground">{hintText(provider, item.id, item.recommended)}</span>}
                  </span>}
              </ComboboxItem>}
            </ComboboxCollection>
          </ComboboxGroup>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    {note}
  </div>;
}

const keyPlaceholder: Record<CoachProviderKind, string> = { openai: "sk-…", anthropic: "sk-ant-…", openrouter: "sk-or-…", ollama: "" };

/** One keyed or Ollama provider's configuration: key (kept when left empty), model or address, test, disconnect. */
function KeyForm({ userId, kind, saved }: { userId: string; kind: CoachProviderKind; saved: CoachProviderDto | null }) {
  const cache = useQueryClient();
  const writes = coachMutations(coach, cache, userId);
  const [model, setModel] = useState(saved?.model ?? coachProviderInfo[kind].model);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? ollamaDefaultUrl);
  const [check, setCheck] = useState<string | null>(null);
  const [tested, setTested] = useState<CoachTestResult | null>(null);
  const save = useMutation({ mutationFn: writes.save, meta: { action: () => `connect ${cardLabel[kind]}` } });
  const disconnect = useMutation({ mutationFn: () => writes.disconnect(kind), meta: { action: () => `disconnect ${cardLabel[kind]}` } });
  const local = kind === "ollama";
  const keepsKey = saved?.keyHint != null;
  const payload = () => ({ provider: kind, model: model.trim(), ...local ? { baseUrl: baseUrl.trim() } : apiKey.trim() ? { apiKey: apiKey.trim() } : {} });
  const unsaved = !!saved && (model.trim() !== saved.model || (!local && !!apiKey.trim()) || (local && baseUrl.trim() !== saved.baseUrl));
  // An unsaved edit is saved first: Test checks what the form shows, not the old saved settings.
  const test = useMutation({ mutationFn: async () => { if (unsaved) await save.mutateAsync(payload()); return writes.test(kind); }, onSuccess: setTested, meta: { action: () => "test the connection" } });
  const pending = save.isPending || disconnect.isPending || test.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTested(null);
    // Same rules as the server (packages/server/src/coach.ts), so the reason shows on web and Mac alike.
    if (local && !ollamaUrl(baseUrl)) return setCheck("Ollama must run on this computer: use a localhost address.");
    if (!local && !keepsKey && apiKey.trim().length < 8) return setCheck("Enter an API key.");
    setCheck(null);
    await save.mutateAsync(payload()).catch(() => undefined);
  }

  return <form className="flex flex-col gap-3" onSubmit={submit} data-coach-form={kind}>
    {local ? <Field>
      <FieldLabel htmlFor={`coach-${kind}-base-url`}>Ollama address</FieldLabel>
      <Input id={`coach-${kind}-base-url`} className="max-w-sm" value={baseUrl} disabled={pending} onChange={event => setBaseUrl(event.target.value)} required maxLength={500} />
      <FieldDescription>Ollama runs on this computer, so it works only where the todalo server runs locally.</FieldDescription>
    </Field> : <Field>
      <FieldLabel htmlFor={`coach-${kind}-api-key`}>API key</FieldLabel>
      <Input id={`coach-${kind}-api-key`} type="password" autoComplete="off" className="max-w-sm" value={apiKey} disabled={pending} maxLength={500} autoFocus={!saved}
        placeholder={keepsKey ? `…${saved!.keyHint} (leave empty to keep)` : keyPlaceholder[kind]} onChange={event => setApiKey(event.target.value)} />
      <FieldDescription>Stored encrypted on the server and never shown again.</FieldDescription>
    </Field>}
    <Field>
      <FieldLabel htmlFor={`coach-${kind}-model`}>Model</FieldLabel>
      <ModelPicker id={`coach-${kind}-model`} userId={userId} provider={kind} value={model} onChange={setModel} disabled={pending} saved={saved?.model}
        draft={local ? { baseUrl: baseUrl.trim() } : apiKey.trim().length >= 8 ? { apiKey: apiKey.trim() } : {}} />
    </Field>
    {(check ?? save.error?.message) && <FormError>{check ?? save.error?.message}</FormError>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" data-coach-action="connect" disabled={pending || !model.trim()}>{saved ? "Save" : "Connect"}</Button>
      {saved && <Button type="button" variant="outline" data-coach-action="test-provider" disabled={pending} onClick={() => { setTested(null); test.mutate(); }}>
        {test.isPending ? "Testing…" : unsaved ? "Save & test" : "Test connection"}</Button>}
      {saved && <Button type="button" variant="ghost" data-coach-action="disconnect" disabled={pending} onClick={() => { setTested(null); disconnect.mutate(); }}>Disconnect</Button>}
    </div>
    <div aria-live="polite">
      {tested && (tested.ok ? <p role="status" className="text-xs-plus text-success" data-coach-test="ok">Connected: the model answered.</p>
        : <FormError>{tested.message ?? "The connection failed."}</FormError>)}
      {(test.error ?? disconnect.error) && <FormError>{(test.error ?? disconnect.error)!.message}</FormError>}
    </div>
  </form>;
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
  const [tested, setTested] = useState<CoachTestResult | null>(null);
  // An unsaved pick is saved first: Test checks the model the dropdown shows, not the old saved one.
  const test = useMutation({ mutationFn: async () => { if (chatgpt && model.trim() && model.trim() !== chatgpt.model) await writes.saveChatgptModel(model.trim()); return writes.test("chatgpt"); }, onSuccess: setTested, meta: { action: () => "test the connection" } });
  const pending = start.isPending || paste.isPending || saveModel.isPending || signOut.isPending || test.isPending;

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

  const error = message ?? start.error?.message ?? paste.error?.message ?? saveModel.error?.message ?? signOut.error?.message ?? test.error?.message;
  return <div className="flex flex-col gap-3" data-coach-chatgpt="">
    {chatgpt?.status === "signed_in" ? <>
      <p className="text-sm">Signed in with ChatGPT{chatgpt.email && <span className="text-muted-foreground"> as {chatgpt.email}</span>}. Usage counts against your ChatGPT plan.</p>
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); saveModel.mutate(model.trim()); }}>
        <Field>
          <FieldLabel htmlFor="coach-chatgpt-model">Model</FieldLabel>
          <ModelPicker id="coach-chatgpt-model" userId={userId} provider="chatgpt" value={model} onChange={setModel} disabled={pending} draft={{}} saved={chatgpt.model} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !model.trim() || model.trim() === chatgpt.model}>Save</Button>
          <Button type="button" variant="outline" data-coach-action="test-provider" disabled={pending} onClick={() => { setTested(null); test.mutate(); }}>
            {test.isPending ? "Testing…" : model.trim() !== chatgpt.model ? "Save & test" : "Test connection"}</Button>
          <Button type="button" variant="ghost" data-coach-action="chatgpt-sign-out" disabled={pending} onClick={() => signOut.mutate()}>Sign out of ChatGPT</Button>
        </div>
      </form>
      <div aria-live="polite">
        {tested && (tested.ok ? <p role="status" className="text-xs-plus text-success" data-coach-test="ok">Connected: the model answered.</p>
          : <FormError>{tested.message ?? "The connection failed."}</FormError>)}
      </div>
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
      {chatgpt?.status === "expired" && <FormError>ChatGPT signed you out. Sign in again; until then the Coach uses another configured provider, if any.</FormError>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-coach-action="chatgpt-sign-in" disabled={pending} onClick={() => { setMessage(null); start.mutate(); }}>
          {start.isPending ? "Starting…" : "Sign in with ChatGPT"}</Button>
        {chatgpt && <Button type="button" variant="ghost" data-coach-action="chatgpt-sign-out" disabled={pending} onClick={() => signOut.mutate()}>Forget ChatGPT sign-in</Button>}
      </div>
      <Hint>Runs the Coach on your ChatGPT plan instead of an API key. OpenAI asks you to allow sharing of your plan with todalo; usage counts against your plan. OpenAI has not published this sign-in for other apps, so it may change or stop working; another provider keeps the Coach running.</Hint>
    </>}
    {error && <FormError>{error}</FormError>}
  </div>;
}
