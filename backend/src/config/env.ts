import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  CLIENT_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(10, "JWT_SECRET must be at least 10 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
});

const parsed = envSchema.safeParse({
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI ?? process.env.MONGODB_URI ?? "",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
});

if (!parsed.success) {
  console.error(
    "Environment validation error",
    parsed.error.flatten().fieldErrors
  );
  throw new Error("Invalid environment configuration");
}

const clientOrigins = parsed.data.CLIENT_ORIGIN
  ? parsed.data.CLIENT_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  : [];

const env = {
  ...parsed.data,
  CLIENT_ORIGINS: clientOrigins,
};

export default env;
