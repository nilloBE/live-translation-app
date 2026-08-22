import { io, type Socket } from "socket.io-client";

export interface SourceLanguage {
  code: string;
  displayName: string;
}

export interface TargetLanguage {
  code: string;
  displayName: string;
}

export interface CaptionMessage {
  roomId: string;
  sourceLanguage: string;
  availableTargets: string[];
  originalText: string;
  translations: Record<string, string>;
  isFinal: boolean;
  timestamp: string;
}

export interface RoomPresence {
  roomId: string;
  audienceCount: number;
}

export interface FinalizedCaption {
  id: string;
  sourceLanguage: string;
  originalText: string;
  translations: Record<string, string>;
  timestamp: string;
}

export interface CaptionStreamState {
  latest: CaptionMessage | null;
  live: CaptionMessage | null;
  history: FinalizedCaption[];
  seq: number;
}

export function createCaptionStreamState(): CaptionStreamState {
  return { latest: null, live: null, history: [], seq: 0 };
}

export function reduceCaptionStream(
  state: CaptionStreamState,
  caption: CaptionMessage,
  historyLimit = 100,
): CaptionStreamState {
  if (!caption.isFinal) {
    return { ...state, latest: caption, live: caption };
  }
  const seq = state.seq + 1;
  const finalized: FinalizedCaption = {
    id: `caption-${seq}`,
    sourceLanguage: caption.sourceLanguage,
    originalText: caption.originalText,
    translations: caption.translations,
    timestamp: caption.timestamp,
  };
  return {
    latest: caption,
    live: null,
    history: [...state.history, finalized].slice(-historyLimit),
    seq,
  };
}

// Multipliers applied to caption text via the --caption-scale CSS custom property.
export const captionFontScales = [0.5, 0.65, 0.8, 1, 1.2, 1.45, 1.75, 2.1];
export const defaultCaptionFontScaleIndex = 3;

export function clampFontScaleIndex(index: number): number {
  if (Number.isNaN(index)) {
    return defaultCaptionFontScaleIndex;
  }
  return Math.min(Math.max(Math.round(index), 0), captionFontScales.length - 1);
}


interface ServerToClientEvents {
  caption: (caption: CaptionMessage) => void;
  "room-presence": (presence: RoomPresence) => void;
}

interface ClientToServerEvents {
  "join-room": (roomId: string, acknowledge?: (presence: RoomPresence) => void) => void;
  "leave-room": (roomId: string, acknowledge?: (presence: RoomPresence) => void) => void;
  "publish-caption": (caption: CaptionMessage, acknowledge?: (ack: { ok: boolean }) => void) => void;
}

export type RealtimeConnection = Socket<ServerToClientEvents, ClientToServerEvents>;

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

export function createRealtimeConnection(apiBaseUrl: string): RealtimeConnection {
  return io(apiBaseUrl, {
    autoConnect: false,
    transports: ["polling", "websocket"],
  });
}

export function normalizeRoomId(roomId: string) {
  const normalizedRoomId = roomId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return normalizedRoomId || "LIVE";
}

export function getTargetLanguageName(code: string): string {
  return targetLanguages.find((language) => language.code === code)?.displayName ?? code;
}

export function getSourceLanguageName(code: string): string {
  return sourceLanguages.find((language) => language.code === code)?.displayName ?? code;
}
