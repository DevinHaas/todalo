import { Elysia } from "elysia";
import { todayIn } from "@todalo/server/season-days";
import { zonedTaskDate } from "@todalo/server/dates";
import {
  checkInDay, checkInPeriod, ritualRunInput, ritualSettingsInput,
  type RitualKind, type RitualRunDto, type RitualRunInput, type RitualSettingsDto, type RitualSettingsInput, type RitualsDto, type RunStatus,
} from "@todalo/server/ritual-dto";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface RitualStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  settings(userId: string): Promise<{ settings: RitualSettingsDto; checkInTaskId: string | null }>;
  save(userId: string, input: RitualSettingsInput): Promise<void>;
  runStatus(userId: string, kind: RitualKind, period: string): Promise<RunStatus | null>;
  /** null when a rated goal is missing, foreign or archived. */
  record(userId: string, input: RitualRunInput): Promise<RitualRunDto | null>;
  checkInTask(userId: string): Promise<{ id: string; dueDate: Date | null } | null>;
  /** Moves (or creates) the Check-in task to start at `start`; null deletes it. Returns its ID. */
  placeCheckIn(userId: string, start: Date | null): Promise<string | null>;
  /** The clock (tests pin it). */
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "A rated goal does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

/**
 * Rituals (goals ticket 11). Same envelope and ownership rules as the season
 * routes; "today" is the client's own day (?timeZone=). The Check-in item is
 * kept on its day here: today until today's Check-in is done or skipped, then
 * tomorrow, at the chosen time. A missed day moves it to today, never overdue.
 */
export function createRitualRoutes(store: RitualStore) {
  const writer = (request: Request) => writeUser(store, request);
  const now = store.now ?? (() => new Date());
  const zoneOf = (request: Request) => zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));

  /** Today's state; `force` re-places the item (settings changed, or a run was recorded). */
  async function state(userId: string, zone: string, force: boolean): Promise<RitualsDto> {
    const { settings, checkInTaskId } = await store.settings(userId);
    const today = todayIn(zone, now());
    const period = checkInPeriod(today);
    const status = await store.runStatus(userId, "checkIn", period);
    let taskId = checkInTaskId;
    if (!settings.checkIn.enabled) {
      if (force) taskId = await store.placeCheckIn(userId, null);
    } else {
      const day = checkInDay(today, status !== null);
      const task = await store.checkInTask(userId);
      // A task the user moved later by hand stays where they put it.
      if (force || !task?.dueDate || todayIn(zone, task.dueDate) < day) taskId = await store.placeCheckIn(userId, zonedTaskDate(day, settings.checkIn.time, zone));
      else taskId = task.id;
    }
    return { settings, checkIn: { period, status, taskId } };
  }

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/rituals", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return state(userId, zoneOf(request), false);
    })
    .put("/rituals/settings", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = ritualSettingsInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      await store.save(userId, input.data);
      return state(userId, zoneOf(request), true);
    })
    // Finishing or skipping a ritual; skipping is always allowed and records nothing else.
    .post("/rituals/runs", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = ritualRunInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const run = await store.record(userId, input.data);
      if (!run) return status(404, NOT_FOUND);
      const zone = zoneOf(request);
      const today = todayIn(zone, now());
      // Today's Check-in done or skipped: its item moves on to tomorrow.
      const rituals = run.kind === "checkIn" && run.period === checkInPeriod(today) ? await state(userId, zone, true) : await state(userId, zone, false);
      return status(201, { run, rituals });
    });
}
