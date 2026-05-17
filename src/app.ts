import cors from "cors";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { apiRoutes } from "./routes/apiRoutes.js";
import { SourceHttpError } from "./services/mycollectricsClient.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.use("/", apiRoutes);
  app.use("/admin", adminRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "validation_error", issues: error.issues });
      return;
    }

    if (error instanceof SourceHttpError) {
      res.status(502).json({ error: "source_error", status: error.status, sourceUrl: error.sourceUrl });
      return;
    }

    if (error instanceof Error && error.name === "SnapshotMissingError") {
      res.status(503).json({ error: "snapshot_missing", message: error.message });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
