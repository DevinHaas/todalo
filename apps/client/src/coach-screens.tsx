import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coach, coachReads } from "./runtime";
import { coachMutations, coachProviderInfo, coachProviderKinds, ollamaDefaultUrl, ollamaUrl, type CoachProviderDto, type CoachProviderKind, type CoachTestResult } from "./coach";
import { FormError, LoadFailure, Loading } from "./goal-views";
import { Badge, Button, Field, FieldDescription, FieldLabel, Hint, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui";

/** Goals ticket 17: Settings › Coach. Connect an AI provider by API key or a local Ollama model, test it, disconnect. */
export function CoachSettingsScreen({ userId }: { userId: string }) {
  const query = useQuery(coachReads.provider(userId));
  if (query.status === "pending") return <div className="ui"><Loading>Loading the Coach…</Loading></div>;
  if (!query.data) return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  return <CoachSettings key={JSON.stringify(query.data.provider)} userId={userId} saved={query.data.provider} />;
}

function CoachSettings({ userId, saved }: { userId: string; saved: CoachProviderDto | null }) {
  const cache = useQueryClient();
  const writes = coachMutations(coach, cache, userId);
  const [provider, setProvider] = useState<CoachProviderKind>(saved?.provider ?? "openai");
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
    {saved && <p className="flex flex-wrap items-center gap-2 text-sm" data-coach-connected="">
      <Badge variant="success">Connected</Badge>
      <span>{coachProviderInfo[saved.provider].label} · {saved.model}{saved.keyHint && <span className="text-muted-foreground"> · key …{saved.keyHint}</span>}</span>
    </p>}
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor="coach-provider">Provider</FieldLabel>
        <Select items={coachProviderKinds.map(value => ({ value, label: coachProviderInfo[value].label }))} value={provider} disabled={pending}
          onValueChange={(value) => { if (value) choose(value as CoachProviderKind); }}>
          <SelectTrigger id="coach-provider" className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>{coachProviderKinds.map(value => <SelectItem key={value} value={value}>{coachProviderInfo[value].label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {local ? <Field>
        <FieldLabel htmlFor="coach-base-url">Ollama address</FieldLabel>
        <Input id="coach-base-url" className="max-w-sm" value={baseUrl} disabled={pending} onChange={event => setBaseUrl(event.target.value)} required maxLength={500} />
        <FieldDescription>Ollama runs on this computer, so it works only where the todalo server runs locally.</FieldDescription>
      </Field> : <Field>
        <FieldLabel htmlFor="coach-api-key">API key</FieldLabel>
        <Input id="coach-api-key" type="password" autoComplete="off" className="max-w-sm" value={apiKey} disabled={pending} maxLength={500}
          placeholder={keepsKey ? `…${saved!.keyHint} (leave empty to keep)` : provider === "openai" ? "sk-…" : "sk-or-…"} onChange={event => setApiKey(event.target.value)} />
        <FieldDescription>Stored encrypted on the server and never shown again.</FieldDescription>
      </Field>}
      <Field>
        <FieldLabel htmlFor="coach-model">Model</FieldLabel>
        <Input id="coach-model" className="max-w-sm" value={model} disabled={pending} onChange={event => setModel(event.target.value)} required maxLength={200} />
      </Field>
      {(check ?? save.error?.message) && <FormError>{check ?? save.error?.message}</FormError>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" data-coach-action="connect" disabled={pending || !model.trim()}>{saved ? "Save" : "Connect"}</Button>
        {saved && <Button type="button" variant="outline" data-coach-action="test" disabled={pending} onClick={() => { setTested(null); test.mutate(); }}>
          {test.isPending ? "Testing…" : "Test connection"}</Button>}
        {saved && <Button type="button" variant="ghost" data-coach-action="disconnect" disabled={pending} onClick={() => { setTested(null); disconnect.mutate(); }}>Disconnect</Button>}
      </div>
      <div aria-live="polite">
        {tested && (tested.ok ? <p role="status" className="text-xs-plus text-success" data-coach-test="ok">Connected: the model answered.</p>
          : <FormError>{tested.message ?? "The connection failed."}</FormError>)}
        {(test.error ?? disconnect.error) && <FormError>{(test.error ?? disconnect.error)!.message}</FormError>}
      </div>
    </form>
    <Hint>When connected, your goal titles, season targets and status numbers are sent to this provider to write the explanations. Nothing is sent without a provider.</Hint>
  </div>;
}
