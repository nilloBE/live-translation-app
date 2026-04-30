import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";

export interface CaptionPayload {
  roomId: string;
  sourceLanguage: string;
  availableTargets: string[];
  originalText: string;
  translations: Record<string, string>;
  isFinal: boolean;
  timestamp: string;
}

interface RoomAck {
  roomId: string;
  audienceCount: number;
}

interface PublishAck {
  ok: boolean;
}

export function configureRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.on("join-room", (roomId: string, acknowledge?: (ack: RoomAck) => void) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      socket.join(normalizedRoomId);

      const ack = buildRoomAck(io, normalizedRoomId);
      acknowledge?.(ack);
      io.to(normalizedRoomId).emit("room-presence", ack);
    });

    socket.on("leave-room", (roomId: string, acknowledge?: (ack: RoomAck) => void) => {
      const normalizedRoomId = normalizeRoomId(roomId);
      socket.leave(normalizedRoomId);

      const ack = buildRoomAck(io, normalizedRoomId);
      acknowledge?.(ack);
      io.to(normalizedRoomId).emit("room-presence", ack);
    });

    socket.on("publish-caption", (payload: CaptionPayload, acknowledge?: (ack: PublishAck) => void) => {
      const caption = normalizeCaption(payload);
      io.to(caption.roomId).emit("caption", caption);
      acknowledge?.({ ok: true });
    });
  });

  return io;
}

function buildRoomAck(io: Server, roomId: string): RoomAck {
  return {
    roomId,
    audienceCount: io.sockets.adapter.rooms.get(roomId)?.size ?? 0,
  };
}

function normalizeCaption(payload: CaptionPayload): CaptionPayload {
  return {
    roomId: normalizeRoomId(payload.roomId),
    sourceLanguage: payload.sourceLanguage,
    availableTargets: Array.isArray(payload.availableTargets) ? payload.availableTargets : [],
    originalText: payload.originalText,
    translations: payload.translations && typeof payload.translations === "object" ? payload.translations : {},
    isFinal: payload.isFinal,
    timestamp: payload.timestamp || new Date().toISOString(),
  };
}

function normalizeRoomId(roomId: string) {
  const normalizedRoomId = roomId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return normalizedRoomId || "LIVE";
}