import { nextMemberNumber } from "@todalo/server/members";

// The number the next sign-up gets; the landing page's badge section polls it.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ next: await nextMemberNumber() }, { headers: { "cache-control": "no-store" } });
}
