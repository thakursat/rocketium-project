import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import env from "../config/env";
import { UserModel } from "../models/user.model";
import { AppError } from "../utils/errors";
import type { SignInInput, SignUpInput } from "../validators/auth.validator";

const SALT_ROUNDS = 10;

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

function toAuthPayload(user: {
  id: string;
  name: string;
  email: string;
}): AuthResult["user"] {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export async function registerUser(input: SignUpInput): Promise<AuthResult> {
  const existing = await UserModel.findOne({
    email: input.email.toLowerCase(),
  });
  if (existing) {
    throw new AppError("VALIDATION_ERROR", "Email already registered", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await UserModel.create({
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash,
  });

  const token = generateToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });
  return {
    token,
    user: toAuthPayload({ id: user.id, name: user.name, email: user.email }),
  };
}

export async function authenticateUser(
  input: SignInInput
): Promise<AuthResult> {
  const user = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (!user) {
    throw new AppError("VALIDATION_ERROR", "Invalid email or password", 401);
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw new AppError("VALIDATION_ERROR", "Invalid email or password", 401);
  }

  const token = generateToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });
  return {
    token,
    user: toAuthPayload({ id: user.id, name: user.name, email: user.email }),
  };
}

export async function getUserById(id: string) {
  const user = await UserModel.findById(id).lean();
  if (!user) {
    throw new AppError("USER_NOT_FOUND", "User not found", 404);
  }
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}
