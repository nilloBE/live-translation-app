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
