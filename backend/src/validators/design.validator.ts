import { z } from "zod";

export const elementSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.enum(["text", "image", "shape"] as const),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  rotation: z.number().optional(),
  scaleX: z.number().positive().optional(),
  scaleY: z.number().positive().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().nonnegative().optional(),
  opacity: z.number().min(0).max(1).optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().positive().optional(),
  text: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  imageUrl: z.string().url().optional(),
  shapeType: z.enum(["rect", "circle"]).optional(),
  zIndex: z.number().int(),
  metadata: z.record(z.unknown()).optional(),
});

export const createDesignSchema = z.object({
  name: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  elements: z.array(elementSchema).default([]),
  isPublic: z.boolean().optional().default(false),
});

export const updateDesignSchema = createDesignSchema
  .partial({ name: true, width: true, height: true, elements: true })
  .extend({
    isPublic: z.boolean().optional(),
  });

export const designIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ElementInput = z.infer<typeof elementSchema>;
export type CreateDesignInput = z.infer<typeof createDesignSchema>;
export type UpdateDesignInput = z.infer<typeof updateDesignSchema>;
