export type ErrorCode =
  | "DESIGN_NOT_FOUND"
  | "COMMENT_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "VERSION_CONFLICT"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 400,
    details?: unknown
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, this.constructor);
  }
}
