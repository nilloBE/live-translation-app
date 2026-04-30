import type { TokenCredential } from "@azure/core-auth";
import { execFile } from "node:child_process";
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
      const token = await requestSpeechAuthorizationToken(tokenEndpoint, accessToken.token);
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

async function requestSpeechAuthorizationToken(tokenEndpoint: string, accessToken: string) {
  try {
    return await requestSpeechAuthorizationTokenWithFetch(tokenEndpoint, accessToken);
  } catch (error) {
    if (!shouldUseWindowsPowerShellFallback(error)) {
      throw error;
    }

    console.warn(
      "Node fetch could not reach the Speech token endpoint. Retrying with PowerShell HTTP stack for local Windows development.",
    );
    return requestSpeechAuthorizationTokenWithPowerShell(tokenEndpoint, accessToken);
  }
}

async function requestSpeechAuthorizationTokenWithFetch(tokenEndpoint: string, accessToken: string) {
  const tokenResponse = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": "0",
    },
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    throw new Error(
      `Speech token request failed with ${tokenResponse.status}: ${detail || tokenResponse.statusText}`,
    );
  }

  return tokenResponse.text();
}

function shouldUseWindowsPowerShellFallback(error: unknown) {
  if (process.platform !== "win32" || config.nodeEnv === "production") {
    return false;
  }

  const message = getNestedErrorMessage(error).toLowerCase();
  return message.includes("fetch failed") || message.includes("econnreset") || message.includes("connect timeout");
}

function requestSpeechAuthorizationTokenWithPowerShell(tokenEndpoint: string, accessToken: string) {
  const script = `
$ErrorActionPreference = 'Stop'
$client = [System.Net.Http.HttpClient]::new()
try {
  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $env:SPEECH_TOKEN_ENDPOINT)
  $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $env:SPEECH_ACCESS_TOKEN)
  $request.Content = [System.Net.Http.ByteArrayContent]::new([byte[]]::new(0))
  $response = $client.SendAsync($request).GetAwaiter().GetResult()
  $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    [Console]::Error.Write("Speech token request failed with " + [int]$response.StatusCode + ": " + $content)
    exit 1
  }
  if ([string]::IsNullOrWhiteSpace($content)) {
    [Console]::Error.Write('Speech token request returned an empty token.')
    exit 1
  }
  [Console]::Out.Write($content)
} catch {
  [Console]::Error.Write('Speech token request failed: ' + $_.Exception.Message)
  exit 1
} finally {
  $client.Dispose()
}
`;

  return runPowerShell(script, {
    SPEECH_TOKEN_ENDPOINT: tokenEndpoint,
    SPEECH_ACCESS_TOKEN: accessToken,
  });
}

function runPowerShell(script: string, env: Record<string, string>) {
  const executable = process.env.PWSH_EXE ?? "pwsh";
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");

  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      executable,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript],
      {
        env: {
          ...process.env,
          ...env,
        },
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        if (!stdout.trim()) {
          reject(new Error("Speech token request returned an empty token."));
          return;
        }

        resolve(stdout);
      },
    );

    child.stdin?.end();
  });
}

function getNestedErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}