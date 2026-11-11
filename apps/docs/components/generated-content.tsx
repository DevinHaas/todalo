import { Fragment } from "react";
import { Shortcut } from "./keyboard-shortcut";
import { shortcutGroups } from "../lib/shortcuts";
import { releaseDate, releases } from "../lib/releases";

function Keys({ bindings }: { bindings: string[][] }) {
  return bindings.map((steps, index) => <Fragment key={index}>
    {index > 0 && " or "}
    {steps.map((step, stepIndex) => <Fragment key={stepIndex}>{stepIndex > 0 && " then "}<Shortcut keys={step} /></Fragment>)}
  </Fragment>);
}

/** Every documented default shortcut, grouped as in the app's shortcut sheet (lib/shortcuts.ts). */
export function ShortcutTable() {
  return shortcutGroups().map(({ group, rows }) => <Fragment key={group}>
    <h3>{group}</h3>
    <table>
      <thead><tr><th>Action</th><th>Shortcut</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td>{row.label}</td>
        <td>{JSON.stringify(row.mac) === JSON.stringify(row.other) ? <Keys bindings={row.mac} /> : <>
          <span data-key-style-content="mac"><Keys bindings={row.mac} /></span>
          <span data-key-style-content="ctrl"><Keys bindings={row.other} /></span>
        </>}</td>
      </tr>)}</tbody>
    </table>
  </Fragment>);
}

/** Every release from the client's release notes, newest first. */
export function ReleaseNotes() {
  return releases.map((release) => <section key={release.version} aria-label={`Version ${release.version}`}>
    <h2 id={`version-${release.version.replaceAll(".", "-")}`}>Version {release.version}</h2>
    <p>{releaseDate(release.date)}{release.title && <> · {release.title}</>}</p>
    <ul>{release.highlights.map((line) => <li key={line}>{line}</li>)}</ul>
    {release.changes?.length ? <ul>{release.changes.map((line) => <li key={line}>{line}</li>)}</ul> : null}
  </section>);
}
