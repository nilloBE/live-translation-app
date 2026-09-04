import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
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

interface RegisterSpeakerPayload {
  roomId: string;
  sourceLanguage: string;
  targetLanguages: string[];
}

// Per-room bookkeeping that Socket.IO's own room registry doesn't retain
// (it only knows which sockets are in a room right now, not history).
interface RoomStats {
  createdAt: string;
  lastActivityAt: string;
  speakerSocketId: string | null;
  sourceLanguage: string | null;
  targetLanguages: string[];
  captionCount: number;
  peakConnectionCount: number;
}

export interface AdminRoomSnapshot {
  roomId: string;
  connectionCount: number;
  peakConnectionCount: number;
  hasSpeaker: boolean;
  sourceLanguage: string | null;
  targetLanguages: string[];
  captionCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface AdminSnapshot {
  serverTime: string;
  serverStartedAt: string;
  uptimeSeconds: number;
  currentConnections: number;
  totalConnectionsEver: number;
  activeRoomCount: number;
  totalCaptionsRelayed: number;
  rejectedPublishCount: number;
  memory: { rssMb: number; heapUsedMb: number };
  rooms: AdminRoomSnapshot[];
}

// Caps that bound how much memory/bandwidth a single misbehaving or
// malicious client can consume via one caption broadcast.
const MAX_TEXT_LENGTH = 4000;
const MAX_TARGET_LANGUAGES = 20;
const ADMIN_PUSH_INTERVAL_MS = 2000;

const roomStats = new Map<string, RoomStats>();
const serverStartedAt = new Date().toISOString();
let totalConnectionsEver = 0;
let totalCaptionsRelayed = 0;
let rejectedPublishCount = 0;
let ioRef: Server | null = null;

export function configureRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
  });
  ioRef = io;

  io.on("connection", (socket) => {
    totalConnectionsEver += 1;

    socket.on(
      "join-room",
      safeHandler((roomId: unknown, acknowledge?: (ack: RoomAck) => void) => {
        const normalizedRoomId = normalizeRoomId(roomId);
        socket.join(normalizedRoomId);
        socket.data.roomId = normalizedRoomId;

        const stats = touchRoom(normalizedRoomId);
        stats.peakConnectionCount = Math.max(
          stats.peakConnectionCount,
          currentConnectionCount(io, normalizedRoomId),
        );

        const ack = buildRoomAck(io, normalizedRoomId);
        acknowledge?.(ack);
        io.to(normalizedRoomId).emit("room-presence", ack);
      }),
    );

    socket.on(
      "leave-room",
      safeHandler((roomId: unknown, acknowledge?: (ack: RoomAck) => void) => {
        const normalizedRoomId = normalizeRoomId(roomId);
        leaveRoom(io, socket, normalizedRoomId);

        const ack = buildRoomAck(io, normalizedRoomId);
        acknowledge?.(ack);
        io.to(normalizedRoomId).emit("room-presence", ack);
      }),
    );

    // Informational only: lets the admin dashboard show which room has an
    // active speaker, in which source language, and to which targets. It
    // does NOT gate publish-caption — an unauthenticated client could still
    // call publish-caption directly, so this is not an authorization
    // boundary. See docs/scaling-plan.md for the real speaker-auth work.
    socket.on(
      "register-speaker",
      safeHandler((payload: unknown, acknowledge?: (ack: { ok: boolean }) => void) => {
        if (!isRegisterSpeakerPayload(payload)) {
          acknowledge?.({ ok: false });
          return;
        }

        const normalizedRoomId = normalizeRoomId(payload.roomId);
        const stats = touchRoom(normalizedRoomId);
        stats.speakerSocketId = socket.id;
        stats.sourceLanguage = payload.sourceLanguage;
        stats.targetLanguages = payload.targetLanguages.slice(0, MAX_TARGET_LANGUAGES);
        socket.data.roomId = normalizedRoomId;
        socket.data.isSpeaker = true;
        acknowledge?.({ ok: true });
      }),
    );

    socket.on(
      "publish-caption",
      safeHandler((payload: unknown, acknowledge?: (ack: PublishAck) => void) => {
        if (!isCaptionPayloadShape(payload)) {
          rejectedPublishCount += 1;
          acknowledge?.({ ok: false });
          return;
        }

        const caption = normalizeCaption(payload);
        const stats = touchRoom(caption.roomId);
        if (!stats.speakerSocketId) {
          stats.speakerSocketId = socket.id;
        }
        stats.captionCount += 1;
        totalCaptionsRelayed += 1;

        io.to(caption.roomId).emit("caption", caption);
        acknowledge?.({ ok: true });
      }),
    );

    socket.on(
      "disconnect",
      safeHandler(() => {
        const roomId = socket.data.roomId as string | undefined;
        if (!roomId) {
          return;
        }
        leaveRoom(io, socket, roomId);
        io.to(roomId).emit("room-presence", buildRoomAck(io, roomId));
      }),
    );
  });

  configureAdminNamespace(io);

  return io;
}

/** Returns a fresh admin snapshot on demand (used by the REST polling endpoint). */
export function getAdminSnapshot(): AdminSnapshot {
  if (!ioRef) {
    throw new Error("Realtime server has not been configured yet.");
  }
  return buildAdminSnapshot(ioRef);
}

function configureAdminNamespace(io: Server) {
  const adminNamespace = io.of("/admin");

  adminNamespace.use((socket, next) => {
    const providedKey = socket.handshake.auth?.key;
    if (!config.adminApiKey || providedKey !== config.adminApiKey) {
      next(new Error("unauthorized"));
      return;
    }
    next();
  });

  adminNamespace.on("connection", (socket) => {
    socket.emit("metrics", buildAdminSnapshot(io));
  });

  // Push a fresh snapshot on an interval rather than on every room event —
  // caption traffic can be several messages/sec per room, far more often
  // than an admin dashboard needs to repaint.
  setInterval(() => {
    if (adminNamespace.sockets.size > 0) {
      adminNamespace.emit("metrics", buildAdminSnapshot(io));
    }
  }, ADMIN_PUSH_INTERVAL_MS);
}

function buildAdminSnapshot(io: Server): AdminSnapshot {
  const rooms: AdminRoomSnapshot[] = [];

  for (const [roomId, stats] of roomStats.entries()) {
    const connectionCount = currentConnectionCount(io, roomId);
    if (connectionCount === 0 && !stats.speakerSocketId) {
      roomStats.delete(roomId);
      continue;
    }
    rooms.push({
      roomId,
      connectionCount,
      peakConnectionCount: Math.max(stats.peakConnectionCount, connectionCount),
      hasSpeaker: stats.speakerSocketId !== null,
      sourceLanguage: stats.sourceLanguage,
      targetLanguages: stats.targetLanguages,
      captionCount: stats.captionCount,
      createdAt: stats.createdAt,
      lastActivityAt: stats.lastActivityAt,
    });
  }

  rooms.sort((a, b) => b.connectionCount - a.connectionCount);
  const memoryUsage = process.memoryUsage();

  return {
    serverTime: new Date().toISOString(),
    serverStartedAt,
    uptimeSeconds: Math.round(process.uptime()),
    currentConnections: io.engine.clientsCount,
    totalConnectionsEver,
    activeRoomCount: rooms.length,
    totalCaptionsRelayed,
    rejectedPublishCount,
    memory: {
      rssMb: roundToOneDecimal(memoryUsage.rss / (1024 * 1024)),
      heapUsedMb: roundToOneDecimal(memoryUsage.heapUsed / (1024 * 1024)),
    },
    rooms,
  };
}

function leaveRoom(io: Server, socket: Socket, roomId: string) {
  socket.leave(roomId);
  const stats = roomStats.get(roomId);
  if (stats?.speakerSocketId === socket.id) {
    stats.speakerSocketId = null;
  }
  if (stats && currentConnectionCount(io, roomId) === 0 && !stats.speakerSocketId) {
    roomStats.delete(roomId);
  }
}

function touchRoom(roomId: string): RoomStats {
  const now = new Date().toISOString();
  const existing = roomStats.get(roomId);
  if (existing) {
    existing.lastActivityAt = now;
    return existing;
  }
  const created: RoomStats = {
    createdAt: now,
    lastActivityAt: now,
    speakerSocketId: null,
    sourceLanguage: null,
    targetLanguages: [],
    captionCount: 0,
    peakConnectionCount: 0,
  };
  roomStats.set(roomId, created);
  return created;
}

function currentConnectionCount(io: Server, roomId: string) {
  return io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
}

function buildRoomAck(io: Server, roomId: string): RoomAck {
  return {
    roomId,
    audienceCount: currentConnectionCount(io, roomId),
  };
}

// A synchronous throw inside a Socket.IO event listener is not caught by the
// framework — it propagates as an uncaught exception and crashes the whole
// process, dropping every connected room at once. Every listener above is
// wrapped in this so one malformed message from one client can't take down
// the other rooms/users sharing this server instance.
function safeHandler<Args extends unknown[]>(handler: (...args: Args) => void) {
  return (...args: Args) => {
    try {
      handler(...args);
    } catch (error) {
      console.error("Realtime handler error:", error);
    }
  };
}

function isRegisterSpeakerPayload(payload: unknown): payload is RegisterSpeakerPayload {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof (payload as RegisterSpeakerPayload).roomId === "string" &&
    typeof (payload as RegisterSpeakerPayload).sourceLanguage === "string" &&
    Array.isArray((payload as RegisterSpeakerPayload).targetLanguages)
  );
}

function isCaptionPayloadShape(payload: unknown): payload is CaptionPayload {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof (payload as CaptionPayload).roomId === "string" &&
    typeof (payload as CaptionPayload).originalText === "string" &&
    typeof (payload as CaptionPayload).isFinal === "boolean"
  );
}

function normalizeCaption(payload: CaptionPayload): CaptionPayload {
  return {
    roomId: normalizeRoomId(payload.roomId),
    sourceLanguage: typeof payload.sourceLanguage === "string" ? payload.sourceLanguage : "",
    availableTargets: Array.isArray(payload.availableTargets)
      ? payload.availableTargets.slice(0, MAX_TARGET_LANGUAGES)
      : [],
    originalText: truncate(payload.originalText, MAX_TEXT_LENGTH),
    translations: normalizeTranslations(payload.translations),
    isFinal: payload.isFinal,
    timestamp: payload.timestamp || new Date().toISOString(),
  };
}

function normalizeTranslations(translations: CaptionPayload["translations"]) {
  if (!translations || typeof translations !== "object") {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(translations).slice(0, MAX_TARGET_LANGUAGES)) {
    result[key] = truncate(typeof value === "string" ? value : String(value ?? ""), MAX_TEXT_LENGTH);
  }
  return result;
}

function truncate(value: string, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeRoomId(roomId: unknown) {
  if (typeof roomId !== "string") {
    return "LIVE";
  }
  const normalizedRoomId = roomId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return normalizedRoomId || "LIVE";
}
