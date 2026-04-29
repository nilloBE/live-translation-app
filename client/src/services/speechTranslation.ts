import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

export type TranslationPairId = "fr-nl" | "es-fr";

export interface TranslationPair {
  id: TranslationPairId;
  label: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceName: string;
  targetName: string;
}

export interface TranslationUpdate {
  originalText: string;
  translatedText: string;
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
  pair: TranslationPair;
  onUpdate: (update: TranslationUpdate) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}

export interface RunningTranslationSession {
  stop: () => Promise<void>;
}

export const translationPairs: TranslationPair[] = [
  {
    id: "fr-nl",
    label: "French to Dutch",
    sourceLanguage: "fr-FR",
    targetLanguage: "nl",
    sourceName: "French",
    targetName: "Dutch",
  },
  {
    id: "es-fr",
    label: "Spanish to French",
    sourceLanguage: "es-ES",
    targetLanguage: "fr",
    sourceName: "Spanish",
    targetName: "French",
  },
];

export async function fetchSpeechToken(apiBaseUrl: string): Promise<SpeechTokenResponse> {
  const response = await fetch(`${apiBaseUrl}/api/speech-token`);

  if (!response.ok) {
    throw new Error(`Token request failed with ${response.status}`);
  }

  return response.json() as Promise<SpeechTokenResponse>;
}

export async function startTranslationSession({
  apiBaseUrl,
  pair,
  onUpdate,
  onStatus,
  onError,
}: StartTranslationOptions): Promise<RunningTranslationSession> {
  const tokenResponse = await fetchSpeechToken(apiBaseUrl);
  const speechConfig = SpeechSDK.SpeechTranslationConfig.fromAuthorizationToken(
    tokenResponse.token,
    tokenResponse.region,
  );

  speechConfig.speechRecognitionLanguage = pair.sourceLanguage;
  speechConfig.addTargetLanguage(pair.targetLanguage);

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.TranslationRecognizer(speechConfig, audioConfig);
  let refreshTimer: number | undefined;

  recognizer.recognizing = (_sender, event) => {
    onUpdate({
      originalText: event.result.text,
      translatedText: readTranslation(event.result, pair.targetLanguage),
      reason: "recognizing",
    });
  };

  recognizer.recognized = (_sender, event) => {
    if (event.result.reason === SpeechSDK.ResultReason.TranslatedSpeech) {
      onUpdate({
        originalText: event.result.text,
        translatedText: readTranslation(event.result, pair.targetLanguage),
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

function readTranslation(result: SpeechSDK.TranslationRecognitionResult, targetLanguage: string) {
  return result.translations.get(targetLanguage) ?? "";
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