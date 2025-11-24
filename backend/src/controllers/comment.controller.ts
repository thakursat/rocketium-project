import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { createCommentSchema } from "../validators/comment.validator";
import { designIdParamSchema } from "../validators/design.validator";
import { createComment, listComments } from "../services/comment.service";

export const listCommentsHandler = asyncHandler(
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

    const comments = await listComments(params.data.id);
    res.json({ comments });
  }
);

export const createCommentHandler = asyncHandler(
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

    const body = createCommentSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid comment payload",
        422,
        body.error.flatten()
      );
    }

    const comment = await createComment(params.data.id, body.data);
    res.status(201).json({ comment: comment.toObject() });
  }
);
