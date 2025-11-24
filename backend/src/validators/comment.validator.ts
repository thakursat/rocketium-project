import { z } from "zod";

export const createCommentSchema = z.object({
  author: z.string().min(1),
  message: z.string().min(1),
  mentions: z.array(z.string()).default([]),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .nullable()
    .optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
