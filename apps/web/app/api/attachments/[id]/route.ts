import { requireUserId } from "@/lib/auth";
import { attachmentFailure, readAttachment } from "@/lib/attachments";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return Response.json({ error: "Sign in to download files." }, { status: 401 }); }
  try {
    const attachment = await readAttachment(userId, (await params).id);
    const fallback = attachment.name.replace(/[^a-zA-Z0-9._ -]/g, "_");
    const encoded = encodeURIComponent(attachment.name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(Buffer.from(attachment.content, "base64"), { headers: {
      "Content-Type": "application/octet-stream", "Content-Length": String(attachment.byteSize),
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) { return attachmentFailure(error); }
}
