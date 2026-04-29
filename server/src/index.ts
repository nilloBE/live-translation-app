import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { createAzureCredential } from "./auth.js";
import { config } from "./config.js";

const app = express();

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
  });
});

createAzureCredential();

app.listen(config.port, () => {
  console.log(`Live Translation API listening on port ${config.port}`);
});
