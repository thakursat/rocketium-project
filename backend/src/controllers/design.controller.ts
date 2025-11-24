import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import {
  createDesignSchema,
  updateDesignSchema,
  designIdParamSchema,
} from "../validators/design.validator";
import {
  createDesign,
  getDesignById,
  listDesigns,
  updateDesign,
} from "../services/design.service";
import { listComments } from "../services/comment.service";

export const createDesignHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = createDesignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid design payload",
        422,
        parsed.error.flatten()
      );
    }

    const design = await createDesign(parsed.data);
    res.status(201).json({ design: design.toObject() });
  }
);

export const listDesignsHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    const designs = await listDesigns();
    res.json({ designs });
  }
);

export const getDesignHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const params = designIdParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid design id",
        422,
        params.error.flatten()
      );
    }

    const design = await getDesignById(params.data.id);
    const comments = await listComments(design.id.toString());
    res.json({ design: design.toObject(), comments });
  }
);

export const updateDesignHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const params = designIdParamSchema.safeParse(req.params);
    if (!params.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid design id",
        422,
        params.error.flatten()
      );
    }

    const body = updateDesignSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid design payload",
        422,
        body.error.flatten()
      );
    }

    const design = await updateDesign(params.data.id, body.data);
    res.json({ design: design.toObject() });
  }
);
