import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/errors";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const isKnown = err instanceof AppError;
  const status = isKnown ? err.statusCode : 500;
  const code = isKnown ? err.code : "INTERNAL_ERROR";
  const message = isKnown ? err.message : "Something went wrong";
  const details = isKnown ? err.details : undefined;

  if (!isKnown) {
    console.error(err);
  }

  res.status(status).json({ code, message, details });
};
