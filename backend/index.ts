import dotenv from "dotenv";
import express, { Request, Response } from "express";
import mongoose from "mongoose";

dotenv.config();

const PORT = Number(process.env.PORT ?? 3000);
// Default URI supports local development if MONGO_URI is not provided.
const MONGO_URI =
  process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/rocketium";

const app = express();

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "healthy" });
});

async function startServer(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error", error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

void startServer();
