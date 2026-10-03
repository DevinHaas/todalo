// Server rendering uses UTC; interactive labels pass the user's calendar zone.
export function taskDateLabel(value: Date | string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(value));
}
