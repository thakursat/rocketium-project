import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app";
import env from "./config/env";
import { setupSockets } from "./socket";

async function bootstrap() {
  try {
    await mongoose.connect(env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.CLIENT_ORIGIN ?? "*",
      credentials: true,
    },
  });

  setupSockets(io);

  server.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Unhandled bootstrap error", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
});
