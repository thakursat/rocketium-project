import express from "express";
import cors from "cors";
import routes from "./routes";
import env from "./config/env";
import { notFoundHandler } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN ?? "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
