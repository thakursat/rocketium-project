import { isValidObjectId } from "mongoose";
import { CommentModel } from "../models/comment.model";
import { AppError } from "../utils/errors";
import type { CreateCommentInput } from "../validators/comment.validator";

export async function listComments(designId: string) {
  if (!isValidObjectId(designId)) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  return CommentModel.find({ designId }).sort({ createdAt: 1 }).lean();
}

export async function createComment(
  designId: string,
  user: { id: string; name: string },
  input: CreateCommentInput
) {
  if (!isValidObjectId(designId)) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  const comment = await CommentModel.create({
    designId,
    authorId: user.id,
    authorName: user.name,
    message: input.message,
    mentions: input.mentions ?? [],
    position: input.position ?? null,
  });

  return comment;
}
