// Goals ticket 22: the Coach chat in the database, scoped to the caller's userId.
// Ticket 29: and the documents attached to it, cleared with it.
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { coachChatMessages, coachDocuments } from "@todalo/db/schema";
import type { ChatMessageRecord, NewChatMessage } from "./coach-chat";
import type { CoachDocumentRecord, NewCoachDocument } from "./coach-documents";

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

/** Clears the conversation and its documents (an "attach" item of an open draft goes with its document). */
export async function clearChat(userId: string) {
  await db.batch([db.delete(coachChatMessages).where(eq(coachChatMessages.userId, userId)), db.delete(coachDocuments).where(eq(coachDocuments.userId, userId))]);
}

/** The session's documents, oldest first (their "d1"… order). */
export const getChatDocuments = (userId: string): Promise<CoachDocumentRecord[]> =>
  db.select({ id: coachDocuments.id, name: coachDocuments.name, mediaType: coachDocuments.mediaType, byteSize: coachDocuments.byteSize, content: coachDocuments.content, text: coachDocuments.text, createdAt: coachDocuments.createdAt })
    .from(coachDocuments).where(eq(coachDocuments.userId, userId)).orderBy(asc(coachDocuments.createdAt));

export async function addChatDocuments(userId: string, documents: NewCoachDocument[]) {
  // One clock per batch would tie their order: a millisecond apart keeps it.
  const at = Date.now();
  if (documents.length) await db.insert(coachDocuments).values(documents.map((document, index) => ({ ...document, userId, createdAt: new Date(at + index) })));
}

export async function deleteChatDocument(userId: string, id: string) {
  await db.delete(coachDocuments).where(and(eq(coachDocuments.id, id), eq(coachDocuments.userId, userId)));
}
