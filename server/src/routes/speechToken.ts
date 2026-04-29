import type { TokenCredential } from "@azure/core-auth";
import { Router } from "express";
import { config } from "../config.js";

const cognitiveServicesScope = "https://cognitiveservices.azure.com/.default";
const speechTokenTtlSeconds = 600;
const clientRefreshMarginSeconds = 60;

interface SpeechTokenResponse {
  token: string;
  region: string;
  expiresInSeconds: number;
  expiresAt: string;
}

export function createSpeechTokenRouter(credential: TokenCredential) {
  const router = Router();

  router.get("/speech-token", async (_request, response, next) => {
    try {
      const accessToken = await credential.getToken(cognitiveServicesScope);

      if (!accessToken?.token) {
        throw new Error("Azure credential did not return an access token.");
      }

      const tokenEndpoint = `${normalizeEndpoint(config.speechEndpoint)}/sts/v1.0/issueToken`;
      const tokenResponse = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Length": "0",
        },
      });

      if (!tokenResponse.ok) {
        const detail = await tokenResponse.text();
        throw new Error(
          `Speech token request failed with ${tokenResponse.status}: ${detail || tokenResponse.statusText}`,
        );
      }

      const token = await tokenResponse.text();
      const expiresInSeconds = speechTokenTtlSeconds - clientRefreshMarginSeconds;
      const payload: SpeechTokenResponse = {
        token,
        region: config.speechRegion,
        expiresInSeconds,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      };

      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, "");
}