import { handleCalendarWebhook } from "@todalo/server/calendar-sync";
import { publish } from "@todalo/server/live";

// Google's push-notification callback for channels registered while
// GOOGLE_WEBHOOK_BASE_URL pointed at this app. Verification and sync live in
// @todalo/server; the notification reaches this process's own stream
// subscribers (legacy browsers). The API serves the same path for its streams.
export async function POST(request: Request) {
  const { status, userId } = await handleCalendarWebhook(request.headers);
  if (userId) publish(userId, "calendar");
  return new Response(null, { status });
}
