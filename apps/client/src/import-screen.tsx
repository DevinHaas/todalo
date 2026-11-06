import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { imports } from "./runtime";
import { defaultInclude, importKeys, type ImportInclude, type ImportPreview, type ImportResult } from "./imports";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const useImportStatus = (userId: string) => useQuery({
  queryKey: importKeys.status(userId), queryFn: () => imports.status(timeZone()),
  // The browser hand-off finishes elsewhere; check back while it is open.
  refetchInterval: (q) => (q.state.data?.status === "pending" ? 3000 : false),
  refetchOnWindowFocus: true,
});

/** One-time "Import from Todoist?" after a new account is created (shown on any device until answered). */
export function ImportPrompt({ userId }: { userId: string }) {
  const query = useImportStatus(userId);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [answered, setAnswered] = useState(false);
  const open = Boolean(query.data?.prompt) && !answered;
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); }, [open]);
  if (!open) return null;
  const answer = (importNow: boolean) => {
    setAnswered(true);
    dialog.current?.close();
    // A failed save only means the prompt may show once more.
    void imports.promptSeen().finally(() => cache.invalidateQueries({ queryKey: importKeys.status(userId) }));
    if (importNow) navigate({ pathname: "/account", hash: "import" });
  };
  // Native <dialog>: focus moves in and is restored, Escape cancels (counts as Skip).
  return <dialog ref={dialog} className="import-prompt" aria-labelledby="import-prompt-title" onCancel={(event) => { event.preventDefault(); answer(false); }}>
    <h2 id="import-prompt-title">Bring your tasks from Todoist?</h2>
    <p className="setting-hint">Import your projects, sections, tasks and labels. You choose what comes over, and you can do this later in Settings.</p>
    <div className="import-actions">
      <button type="button" className="button" autoFocus onClick={() => answer(true)}>Import from Todoist</button>
      <button type="button" className="text-action" onClick={() => answer(false)}>Skip</button>
    </div>
  </dialog>;
}

/** Settings › Import from Todoist (`/account#import`). */
export function ImportSettingsScreen({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const key = importKeys.status(userId);
  const query = useImportStatus(userId);
  const refresh = () => void cache.invalidateQueries({ queryKey: key });
  const connect = useMutation({ mutationFn: () => imports.connect(), onSettled: refresh });
  const disconnect = useMutation({ mutationFn: () => imports.disconnect(), onSettled: refresh });
  const run = useMutation({
    mutationFn: imports.run,
    onSuccess: (result) => {
      cache.setQueryData(key, { status: "done", result });
      // Tasks, projects, labels and counts all changed.
      void cache.invalidateQueries({ predicate: (q) => q.queryKey[0] === "user" && q.queryKey[1] === userId && q.queryKey[2] !== "import" });
    },
    onError: refresh,
  });

  useEffect(() => { if (location.hash === "#import") document.getElementById("import")?.scrollIntoView({ block: "start" }); }, [query.isPending]);

  const error = connect.error ?? disconnect.error ?? run.error;
  const state = query.data;
  let body;
  if (query.isPending) body = <p className="state" role="status">Checking Todoist…</p>;
  else if (!state) body = <p className="error" role="alert">{query.error?.message} <button type="button" className="text-action" onClick={() => void query.refetch()}>Try again</button></p>;
  else if (state.status === "pending") body = <div className="import-card">
    <p role="status">Waiting for Todoist… Finish connecting in your browser, then come back here.</p>
    <button type="button" className="text-action" onClick={() => disconnect.mutate()}>Cancel</button>
  </div>;
  else if (state.status === "running" || run.isPending) body = <p className="state" role="status">Importing from Todoist…</p>;
  else if (state.status === "connected") body = <ImportChooser preview={state.preview} onCancel={() => disconnect.mutate()}
    onImport={(projectIds, include) => run.mutate({ projectIds, include, timeZone: timeZone() })} />;
  else body = <>
    {state.status === "done" && <ImportSummary result={state.result} />}
    {state.status === "failed" && <p className="error" role="alert">{state.error === "denied" ? "Todoist access was not granted." : "Todoist could not be connected."} Nothing was imported.</p>}
    <div className="import-card">
      <p className="setting-hint">Bring your projects, sections, tasks and labels from Todoist. You choose what to import; anything imported before is skipped.</p>
      <button type="button" className="button" disabled={connect.isPending} onClick={() => connect.mutate()}>
        {state.status === "done" ? "Import again" : "Connect Todoist"}
      </button>
    </div>
  </>;

  return <section id="import" className="import-settings" aria-labelledby="import-title">
    <h2 id="import-title" className="settings-heading">Import from Todoist</h2>
    {error && <p className="error" role="alert">{error.message}</p>}
    {body}
  </section>;
}

const categories: { key: keyof ImportInclude; label: string; count?: keyof ImportPreview["counts"] }[] = [
  { key: "sections", label: "Sections", count: "sections" },
  { key: "subtasks", label: "Sub-tasks", count: "subtasks" },
  { key: "labels", label: "Labels", count: "labels" },
  { key: "recurring", label: "Recurring schedules", count: "recurring" },
  { key: "comments", label: "Comments (added to the task description)", count: "comments" },
  { key: "completed", label: "Completed tasks from the last 3 months" },
];

export function ImportChooser({ preview, onImport, onCancel }: {
  preview: ImportPreview; onImport: (projectIds: string[], include: ImportInclude) => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(preview.projects.map((p) => p.id)));
  const [include, setInclude] = useState(defaultInclude);
  const toggle = (id: string, on: boolean) => setSelected((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  const imported = preview.projects.reduce((sum, p) => sum + p.imported, 0);
  return <form className="import-card" onSubmit={(event) => { event.preventDefault(); onImport([...selected], include); }}>
    <fieldset>
      <legend className="setting-title">Projects</legend>
      {preview.projects.map((project) => <label key={project.id} className="import-option">
        <input type="checkbox" checked={selected.has(project.id)} onChange={(event) => toggle(project.id, event.target.checked)} />
        <span>{project.inbox ? "Inbox (into your todalo Inbox)" : project.name}</span>
        <span className="setting-hint">{plural(project.tasks, "task")}{project.imported ? `, ${project.imported} already imported` : ""}</span>
      </label>)}
    </fieldset>
    <fieldset>
      <legend className="setting-title">Also import</legend>
      {categories.map(({ key, label, count }) => <label key={key} className="import-option">
        <input type="checkbox" checked={include[key]} onChange={(event) => setInclude({ ...include, [key]: event.target.checked })} />
        <span>{label}</span>
        {count && <span className="setting-hint">{preview.counts[count]}</span>}
      </label>)}
    </fieldset>
    {imported > 0 && <p className="setting-hint">{plural(imported, "task")} were imported before and will be skipped.</p>}
    <div className="import-actions">
      <button type="submit" className="button" disabled={selected.size === 0}>Import</button>
      <button type="button" className="text-action" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

export function ImportSummary({ result }: { result: ImportResult }) {
  const { created } = result;
  return <div className="import-card" role="status">
    <p className="setting-title">Import finished</p>
    <p>Added {plural(created.tasks, "task")}, {plural(created.projects, "project")}, {plural(created.sections, "section")} and {plural(created.labels, "label")}.
      {result.skipped > 0 && ` Skipped ${plural(result.skipped, "task")} imported before.`}</p>
    {result.warnings.length > 0 && <ul className="setting-hint">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
  </div>;
}
