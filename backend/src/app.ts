import express from "express";
import cors from "cors";
import path from "path";
import routes from "./routes";
import env from "./config/env";
import { notFoundHandler } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

const allowedOrigins = env.CLIENT_ORIGINS;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      console.warn(`Blocked CORS origin: ${origin}`);
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

app.use("/api", routes);

const staticDir = path.resolve(__dirname, "public");
app.use(express.static(staticDir));

app.get(/^\/(?!api).*/, (_req, res, next) => {
  res.sendFile(path.join(staticDir, "index.html"), (error) => {
    if (error) {
      next(error);
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
