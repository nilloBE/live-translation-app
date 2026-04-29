import "dotenv/config";

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number.parseInt(process.env.PORT ?? "3001", 10),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  speechRegion: process.env.SPEECH_REGION ?? "westeurope",
  speechEndpoint: process.env.SPEECH_ENDPOINT ?? "https://speech-live-translation-dev.cognitiveservices.azure.com",
};
