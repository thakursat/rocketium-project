import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { signInSchema, signUpSchema } from "../validators/auth.validator";
import {
  authenticateUser,
  getUserById,
  registerUser,
} from "../services/auth.service";
import type { AuthenticatedRequest } from "../types/express";

export const signUpHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = signUpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid signup payload",
        422,
        parsed.error.flatten()
      );
    }

    const result = await registerUser(parsed.data);
    res.status(201).json(result);
  }
);

export const signInHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = signInSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid signin payload",
        422,
        parsed.error.flatten()
      );
    }

    const result = await authenticateUser(parsed.data);
    res.json(result);
  }
);

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) {
    throw new AppError("AUTH_ERROR", "Authentication required", 401);
  }

  const currentUser = await getUserById(user.id);
  res.json({ user: currentUser });
});
