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
import { createRequestLimit } from './requestLimits.js';

const app = express();
app.set('trust proxy', false);
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
process.on("unhandledRejection", () => {
  console.error("Unhandled promise rejection; details suppressed to protect request data.");
});

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
  }),
);
app.use(morgan(':method :status :response-time ms'));
app.use('/api/speech-token', createRequestLimit(120));
app.use('/api/admin', createRequestLimit(600));
app.use(express.json({ limit: '16kb' }));

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
    console.error('Request failed; details suppressed to protect request data.');
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
