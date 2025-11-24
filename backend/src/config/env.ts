import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  CLIENT_ORIGIN: z.string().optional(),
});

const parsed = envSchema.safeParse({
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI ?? process.env.MONGODB_URI ?? "",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
});

if (!parsed.success) {
  console.error(
    "Environment validation error",
    parsed.error.flatten().fieldErrors
  );
  throw new Error("Invalid environment configuration");
}

const env = parsed.data;

export default env;
