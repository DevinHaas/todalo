// Goals ticket 22: the Coach chat in the database, scoped to the caller's userId.
import { desc, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { coachChatMessages } from "@todalo/db/schema";
import type { ChatMessageRecord, NewChatMessage } from "./coach-chat";

const columns = { id: coachChatMessages.id, role: coachChatMessages.role, content: coachChatMessages.content, draftId: coachChatMessages.draftId, createdAt: coachChatMessages.createdAt };

/** The last `limit` messages, oldest first. */
export async function getChatMessages(userId: string, limit: number): Promise<ChatMessageRecord[]> {
  const rows = await db.select(columns).from(coachChatMessages).where(eq(coachChatMessages.userId, userId))
    .orderBy(desc(coachChatMessages.createdAt)).limit(limit);
  return rows.reverse();
}

export async function appendChatMessages(userId: string, messages: NewChatMessage[]) {
  if (messages.length) await db.insert(coachChatMessages).values(messages.map(message => ({ ...message, userId })));
}

export async function clearChat(userId: string) {
  await db.delete(coachChatMessages).where(eq(coachChatMessages.userId, userId));
}
