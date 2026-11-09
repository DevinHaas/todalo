import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui";
import { experiments, releases, type Release } from "./releases";

export type ReleaseDialogKind = "whats-new" | "changelog" | "experiments";

const longDate = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Notes({ release }: { release: Release }) {
  return <section className="flex flex-col gap-2" aria-label={`Version ${release.version}`}>
    <p className="text-xs text-muted-foreground">Version {release.version} · {longDate.format(new Date(release.date))}</p>
    {release.title && <h3 className="text-sm font-semibold">{release.title}</h3>}
    <ul className="flex list-disc flex-col gap-1 pl-5">{release.highlights.map(line => <li key={line}>{line}</li>)}</ul>
    {release.changes?.length ? <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">{release.changes.map(line => <li key={line}>{line}</li>)}</ul> : null}
  </section>;
}

/** What's new (latest release), the Changelog (every release) and Latest experiments, from releases.ts. */
export function ReleaseDialog({ kind, onClose }: { kind: ReleaseDialogKind | null; onClose: () => void }) {
  const title = kind === "changelog" ? "Changelog" : kind === "experiments" ? "Latest experiments" : "What's new";
  return <Dialog open={kind !== null} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent size="xl" className="max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{kind === "experiments" ? "Features we're still shaping. They may change or go away." : kind === "changelog" ? "Every todalo release, newest first." : "Highlights from the latest release."}</DialogDescription>
      </DialogHeader>
      <DialogBody className="gap-6">
        {kind === "whats-new" && releases[0] && <Notes release={releases[0]} />}
        {kind === "changelog" && releases.map(release => <Notes key={release.version} release={release} />)}
        {kind === "experiments" && <ul className="flex flex-col gap-3">{experiments.map(item => <li key={item.title}>
          <p className="font-semibold">{item.title}</p><p className="text-muted-foreground">{item.description}</p>
        </li>)}</ul>}
      </DialogBody>
    </DialogContent>
  </Dialog>;
}
