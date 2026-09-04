import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { createAzureCredential } from "./auth.js";
import { config } from "./config.js";
import { configureRealtime } from "./realtime.js";
import { createAdminRouter } from "./routes/admin.js";
import { createSpeechTokenRouter } from "./routes/speechToken.js";

const app = express();
const httpServer = createServer(app);
const credential = createAzureCredential();

if (!config.adminApiKey) {
  console.warn(
    "ADMIN_API_KEY is not set — the /api/admin/status endpoint and /admin realtime namespace " +
      "will reject all requests until it is configured.",
  );
}

// A synchronous handler throwing (see realtime.ts) is already caught, but log
// any promise rejection that slips through elsewhere instead of letting the
// process crash silently and drop every connected room.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
  }),
);
app.use(express.json());
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    speechRegion: config.speechRegion,
  });
});

app.get("/api/config", (_request, response) => {
  response.json({
    speechRegion: config.speechRegion,
    authMode: "entra-id",
    realtimeMode: "socket.io-local",
    sourceLanguages: ["en-US", "en-GB", "fr-FR", "es-ES", "de-DE", "it-IT", "pt-PT", "nl-NL", "ja-JP", "zh-CN"],
    targetLanguages: ["en", "fr", "es", "de", "it", "pt", "nl", "ja", "zh-Hans"],
  });
});

app.use("/api", createSpeechTokenRouter(credential));
app.use("/api/admin", createAdminRouter());

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    response.status(500).json({
      error: "Internal server error",
      message: config.nodeEnv === "production" ? undefined : getErrorMessage(error),
    });
  },
);

configureRealtime(httpServer);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

httpServer.listen(config.port, () => {
  console.log(`Live Translation API listening on port ${config.port}`);
});
