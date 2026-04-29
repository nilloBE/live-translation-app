import { io, type Socket } from "socket.io-client";

export interface CaptionMessage {
  roomId: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  isFinal: boolean;
  timestamp: string;
}

export interface RoomPresence {
  roomId: string;
  audienceCount: number;
}

export type RealtimeConnection = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ServerToClientEvents {
  caption: (caption: CaptionMessage) => void;
  "room-presence": (presence: RoomPresence) => void;
}

interface ClientToServerEvents {
  "join-room": (roomId: string, acknowledge?: (presence: RoomPresence) => void) => void;
  "leave-room": (roomId: string, acknowledge?: (presence: RoomPresence) => void) => void;
  "publish-caption": (caption: CaptionMessage, acknowledge?: (ack: { ok: boolean }) => void) => void;
}

export function createRealtimeConnection(apiBaseUrl: string): RealtimeConnection {
  return io(apiBaseUrl, {
    autoConnect: false,
    transports: ["websocket", "polling"],
  });
}

export function normalizeRoomId(roomId: string) {
  const normalizedRoomId = roomId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return normalizedRoomId || "LIVE";
}