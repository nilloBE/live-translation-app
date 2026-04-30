import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

export interface SourceLanguage {
  code: string;
  displayName: string;
}

export interface TargetLanguage {
  code: string;
  displayName: string;
}

export interface TranslationUpdate {
  originalText: string;
  translations: Record<string, string>;
  reason: "recognizing" | "recognized";
}

export interface SpeechTokenResponse {
  token: string;
  region: string;
  expiresInSeconds: number;
  expiresAt: string;
}

export interface StartTranslationOptions {
  apiBaseUrl: string;
  sourceLanguage: string;
  targetLanguages: string[];
  onUpdate: (update: TranslationUpdate) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}

export interface RunningTranslationSession {
  stop: () => Promise<void>;
}

// Curated source locales (Speech-to-Text format).
export const sourceLanguages: SourceLanguage[] = [
  { code: "en-US", displayName: "English (US)" },
  { code: "en-GB", displayName: "English (UK)" },
  { code: "fr-FR", displayName: "French" },
  { code: "es-ES", displayName: "Spanish" },
  { code: "de-DE", displayName: "German" },
  { code: "it-IT", displayName: "Italian" },
  { code: "pt-PT", displayName: "Portuguese" },
  { code: "nl-NL", displayName: "Dutch" },
  { code: "ja-JP", displayName: "Japanese" },
  { code: "zh-CN", displayName: "Chinese (Mandarin)" },
];

// Curated target codes (Translator format, no region).
export const targetLanguages: TargetLanguage[] = [
  { code: "en", displayName: "English" },
  { code: "fr", displayName: "French" },
  { code: "es", displayName: "Spanish" },
  { code: "de", displayName: "German" },
  { code: "it", displayName: "Italian" },
  { code: "pt", displayName: "Portuguese" },
  { code: "nl", displayName: "Dutch" },
  { code: "ja", displayName: "Japanese" },
  { code: "zh-Hans", displayName: "Chinese (Simplified)" },
];

export function getTargetLanguageName(code: string): string {
  return targetLanguages.find((language) => language.code === code)?.displayName ?? code;
}

export function getSourceLanguageName(code: string): string {
  return sourceLanguages.find((language) => language.code === code)?.displayName ?? code;
}

export async function fetchSpeechToken(apiBaseUrl: string): Promise<SpeechTokenResponse> {
  const response = await fetch(`${apiBaseUrl}/api/speech-token`);

  if (!response.ok) {
    throw new Error(`Token request failed with ${response.status}`);
  }

  return response.json() as Promise<SpeechTokenResponse>;
}

export async function startTranslationSession({
  apiBaseUrl,
  sourceLanguage,
  targetLanguages: requestedTargets,
  onUpdate,
  onStatus,
  onError,
}: StartTranslationOptions): Promise<RunningTranslationSession> {
  if (requestedTargets.length === 0) {
    throw new Error("Select at least one target language before starting translation.");
  }

  const tokenResponse = await fetchSpeechToken(apiBaseUrl);
  const speechConfig = SpeechSDK.SpeechTranslationConfig.fromAuthorizationToken(
    tokenResponse.token,
    tokenResponse.region,
  );

  speechConfig.speechRecognitionLanguage = sourceLanguage;
  for (const target of requestedTargets) {
    speechConfig.addTargetLanguage(target);
  }

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.TranslationRecognizer(speechConfig, audioConfig);
  let refreshTimer: number | undefined;

  recognizer.recognizing = (_sender, event) => {
    onUpdate({
      originalText: event.result.text,
      translations: readTranslations(event.result, requestedTargets),
      reason: "recognizing",
    });
  };

  recognizer.recognized = (_sender, event) => {
    if (event.result.reason === SpeechSDK.ResultReason.TranslatedSpeech) {
      onUpdate({
        originalText: event.result.text,
        translations: readTranslations(event.result, requestedTargets),
        reason: "recognized",
      });
    }
  };

  recognizer.canceled = (_sender, event) => {
    onError(event.errorDetails || `Speech recognition canceled: ${event.reason}`);
  };

  recognizer.sessionStarted = () => {
    onStatus("Listening");
  };

  recognizer.sessionStopped = () => {
    onStatus("Stopped");
  };

  await startRecognizer(recognizer);

  refreshTimer = window.setInterval(async () => {
    try {
      const refreshedToken = await fetchSpeechToken(apiBaseUrl);
      recognizer.authorizationToken = refreshedToken.token;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to refresh Speech token.");
    }
  }, tokenResponse.expiresInSeconds * 1000);

  return {
    stop: async () => {
      if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer);
      }

      await stopRecognizer(recognizer);
      recognizer.close();
    },
  };
}

function readTranslations(
  result: SpeechSDK.TranslationRecognitionResult,
  targets: string[],
): Record<string, string> {
  const translations: Record<string, string> = {};
  for (const code of targets) {
    const value = result.translations.get(code);
    if (value) {
      translations[code] = value;
    }
  }
  return translations;
}

function startRecognizer(recognizer: SpeechSDK.TranslationRecognizer) {
  return new Promise<void>((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(resolve, reject);
  });
}

function stopRecognizer(recognizer: SpeechSDK.TranslationRecognizer) {
  return new Promise<void>((resolve, reject) => {
    recognizer.stopContinuousRecognitionAsync(resolve, reject);
  });
}
