import { auth } from "@/lib/auth";
import { subscribe } from "@todalo/server/live";

export const dynamic = "force-dynamic";

// Legacy browser stream: `data: sync` on any calendar change in this process.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response(null, { status: 401 });

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      };
      unsubscribe = subscribe(userId, (topic) => { if (topic === "calendar") send(`data: sync\n\n`); });
      heartbeat = setInterval(() => send(`: heartbeat\n\n`), 25_000);
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
