import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { createAzureCredential } from "./auth.js";
import { config } from "./config.js";
import { configureRealtime } from "./realtime.js";
import { createSpeechTokenRouter } from "./routes/speechToken.js";

const app = express();
const httpServer = createServer(app);
const credential = createAzureCredential();

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
    translationPairs: [
      { sourceLanguage: "fr-FR", targetLanguage: "nl" },
      { sourceLanguage: "es-ES", targetLanguage: "fr" },
    ],
  });
});

app.use("/api", createSpeechTokenRouter(credential));

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
