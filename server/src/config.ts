import "dotenv/config";

const defaultCorsOrigins = ["http://localhost:5173", "http://localhost:5174"];

function parseCorsOrigins(value: string | undefined) {
  return value?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? defaultCorsOrigins;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number.parseInt(process.env.PORT ?? "3001", 10),
  corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),
  speechRegion: process.env.SPEECH_REGION ?? "westeurope",
  speechEndpoint: process.env.SPEECH_ENDPOINT ?? "https://speech-live-translation-dev.cognitiveservices.azure.com",
};
