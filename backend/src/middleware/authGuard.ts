import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import env from "../config/env";
import { AppError } from "../utils/errors";
import type { AuthTokenPayload } from "../services/auth.service";
import type { AuthenticatedRequest } from "../types/express";

export const authGuard: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError("AUTH_ERROR", "Authentication required", 401));
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    const request = req as AuthenticatedRequest;
    request.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch (error) {
    next(new AppError("AUTH_ERROR", "Invalid or expired token", 401));
  }
};
