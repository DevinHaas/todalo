// "What's new" is generated from the client's release notes: one of the two reads of
// client data the help center allows (spec: Process; the other is theme-reference.ts).
// Never copy notes by hand.
export { releases, type Release } from "../../client/src/releases";

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const releaseDate = (date: string) => longDate.format(new Date(date));
