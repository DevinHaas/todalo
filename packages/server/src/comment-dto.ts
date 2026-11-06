// Client-safe comment contract and input rules (zod only, no database).
import { z } from "zod";

export interface CommentDto {
  id: string;
  taskId: string;
  body: string;
  /** ISO-8601 UTC instant. */
  createdAt: string;
  author: { name: string; image: string | null };
}

export const commentInput = z.object({
  /** Client-generated operation ID: a retried add returns the same comment. */
  id: z.uuid(),
  body: z.string().trim().min(1).max(10_000),
}).strict();
export type CommentInput = z.infer<typeof commentInput>;
