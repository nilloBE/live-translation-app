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
  ok: boolean;
  error?: string;
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
  audienceCount: number;
  speakerCount: number;
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
const MAX_ROOMS = 12;
const MAX_ROOM_CONNECTIONS = 80;
const sources = new Set(['en-US', 'en-GB', 'fr-FR', 'es-ES', 'de-DE', 'it-IT', 'pt-PT', 'nl-NL', 'ja-JP', 'zh-CN']);
const targets = new Set(['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ja', 'zh-Hans']);
const roomChannel = (roomId: string) => `room:${roomId}`;

function createLimit(max: number, interval: number) {
  let start = 0;
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - start >= interval) { start = now; count = 0; }
    return ++count <= max;
  };
}

const roomStats = new Map<string, RoomStats>();
const serverStartedAt = new Date().toISOString();
let totalConnectionsEver = 0;
let totalCaptionsRelayed = 0;
let rejectedPublishCount = 0;
let ioRef: Server | null = null;

export function configureRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    maxHttpBufferSize: 64 * 1024,
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
  });
  ioRef = io;
  roomStats.clear();
  totalConnectionsEver = 0;
  totalCaptionsRelayed = 0;
  rejectedPublishCount = 0;
  io.use((_socket, next) => next(io.of('/').sockets.size >= 256 ? new Error('participant capacity reached') : undefined));

  io.on("connection", (socket) => {
    totalConnectionsEver += 1;
    const joinAllowed = createLimit(20, 60_000);
    const registerAllowed = createLimit(20, 60_000);
    const publishAllowed = createLimit(40, 1_000);
    const idleTimer = setTimeout(() => { if (!socket.data.roomId) socket.disconnect(true); }, 30_000);
    idleTimer.unref();

    socket.on(
      "join-room",
      safeHandler((roomId: unknown, acknowledge?: (ack: RoomAck) => void) => {
        const normalizedRoomId = normalizeRoomId(roomId);
        if (!joinAllowed() || !normalizedRoomId ||
            (!roomStats.has(normalizedRoomId) && roomStats.size >= MAX_ROOMS) ||
            (socket.data.roomId !== normalizedRoomId && currentConnectionCount(io, normalizedRoomId) >= MAX_ROOM_CONNECTIONS)) {
          if (typeof acknowledge === 'function') acknowledge({ ok: false, roomId: '', audienceCount: 0, error: 'Invalid room or room limit reached.' });
          return;
        }
        if (socket.data.roomId && socket.data.roomId !== normalizedRoomId) leaveRoom(io, socket, socket.data.roomId);
        socket.join(roomChannel(normalizedRoomId));
        socket.data.roomId = normalizedRoomId;

        const stats = touchRoom(normalizedRoomId);
        stats.peakConnectionCount = Math.max(
          stats.peakConnectionCount,
          currentConnectionCount(io, normalizedRoomId),
        );

        const ack = buildRoomAck(io, normalizedRoomId);
        if (typeof acknowledge === 'function') acknowledge(ack);
        io.to(roomChannel(normalizedRoomId)).emit("room-presence", ack);
      }),
    );

    socket.on(
      "leave-room",
      safeHandler((roomId: unknown, acknowledge?: (ack: RoomAck) => void) => {
        const normalizedRoomId = normalizeRoomId(roomId);
        if (!joinAllowed() || !normalizedRoomId || socket.data.roomId !== normalizedRoomId) {
          if (typeof acknowledge === 'function') acknowledge({ ok: false, roomId: '', audienceCount: 0 });
          return;
        }
        leaveRoom(io, socket, normalizedRoomId);

        const ack = buildRoomAck(io, normalizedRoomId);
        if (typeof acknowledge === 'function') acknowledge(ack);
      }),
    );

    socket.on(
      "register-speaker",
      safeHandler((payload: unknown, acknowledge?: (ack: { ok: boolean }) => void) => {
        if (!registerAllowed() || !isRegisterSpeakerPayload(payload)) {
          if (typeof acknowledge === 'function') acknowledge({ ok: false });
          return;
        }

        const normalizedRoomId = normalizeRoomId(payload.roomId);
        const stats = roomStats.get(normalizedRoomId);
        if (!stats || socket.data.roomId !== normalizedRoomId || (stats.speakerSocketId && stats.speakerSocketId !== socket.id)) {
          if (typeof acknowledge === 'function') acknowledge({ ok: false });
          return;
        }
        stats.speakerSocketId = socket.id;
        stats.sourceLanguage = payload.sourceLanguage;
        stats.targetLanguages = payload.targetLanguages.slice(0, MAX_TARGET_LANGUAGES);
        socket.data.roomId = normalizedRoomId;
        socket.data.isSpeaker = true;
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
        io.to(roomChannel(normalizedRoomId)).emit('room-presence', buildRoomAck(io, normalizedRoomId));
      }),
    );

    socket.on(
      "publish-caption",
      safeHandler((payload: unknown, acknowledge?: (ack: PublishAck) => void) => {
        if (!publishAllowed() || !isCaptionPayloadShape(payload)) {
          rejectedPublishCount += 1;
          if (typeof acknowledge === 'function') acknowledge({ ok: false });
          return;
        }

        const caption = normalizeCaption(payload);
        const stats = roomStats.get(caption.roomId);
        if (!stats || stats.speakerSocketId !== socket.id || socket.data.roomId !== caption.roomId ||
            stats.sourceLanguage !== caption.sourceLanguage ||
            stats.targetLanguages.length !== caption.availableTargets.length ||
            !caption.availableTargets.every((target) => stats.targetLanguages.includes(target))) {
          rejectedPublishCount += 1;
          if (typeof acknowledge === 'function') acknowledge({ ok: false });
          return;
        }
        stats.lastActivityAt = new Date().toISOString();
        stats.captionCount += 1;
        totalCaptionsRelayed += 1;

        io.to(roomChannel(caption.roomId)).emit("caption", caption);
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
      }),
    );

    socket.on(
      "disconnect",
      safeHandler(() => {
        clearTimeout(idleTimer);
        const roomId = socket.data.roomId as string | undefined;
        if (!roomId) {
          return;
        }
        leaveRoom(io, socket, roomId);
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
    if (!config.adminApiKey || providedKey !== config.adminApiKey || adminNamespace.sockets.size >= 8) {
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
  const timer = setInterval(() => {
    if (adminNamespace.sockets.size > 0) {
      adminNamespace.emit("metrics", buildAdminSnapshot(io));
    }
  }, ADMIN_PUSH_INTERVAL_MS);
  timer.unref();
  io.httpServer?.once('close', () => clearInterval(timer));
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
      audienceCount: connectionCount - (stats.speakerSocketId ? 1 : 0),
      speakerCount: stats.speakerSocketId ? 1 : 0,
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
    currentConnections: rooms.reduce((sum, room) => sum + room.connectionCount, 0),
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
  socket.leave(roomChannel(roomId));
  if (socket.data.roomId === roomId) { delete socket.data.roomId; delete socket.data.isSpeaker; }
  const stats = roomStats.get(roomId);
  if (stats?.speakerSocketId === socket.id) {
    stats.speakerSocketId = null;
    stats.sourceLanguage = null;
    stats.targetLanguages = [];
  }
  if (stats && currentConnectionCount(io, roomId) === 0 && !stats.speakerSocketId) {
    roomStats.delete(roomId);
  }
  io.to(roomChannel(roomId)).emit('room-presence', buildRoomAck(io, roomId));
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
  return io.sockets.adapter.rooms.get(roomChannel(roomId))?.size ?? 0;
}

function buildRoomAck(io: Server, roomId: string): RoomAck {
  return {
    ok: true,
    roomId,
    audienceCount: currentConnectionCount(io, roomId) - (roomStats.get(roomId)?.speakerSocketId ? 1 : 0),
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
    } catch {
      console.error("Realtime handler rejected an invalid event.");
    }
  };
}

function isRegisterSpeakerPayload(payload: unknown): payload is RegisterSpeakerPayload {
  return (
    !!payload &&
    typeof payload === "object" &&
    !!normalizeRoomId((payload as RegisterSpeakerPayload).roomId) &&
    sources.has((payload as RegisterSpeakerPayload).sourceLanguage) &&
    validTargets((payload as RegisterSpeakerPayload).targetLanguages) &&
    Buffer.byteLength(JSON.stringify(payload)) <= 2048
  );
}

function isCaptionPayloadShape(payload: unknown): payload is CaptionPayload {
  if (!payload || typeof payload !== 'object') return false;
  const caption = payload as CaptionPayload;
  return !!normalizeRoomId(caption.roomId) && sources.has(caption.sourceLanguage) &&
    validTargets(caption.availableTargets) && typeof caption.originalText === 'string' && caption.originalText.length <= MAX_TEXT_LENGTH &&
    typeof caption.isFinal === 'boolean' && typeof caption.timestamp === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(caption.timestamp) && Number.isFinite(Date.parse(caption.timestamp)) &&
    !!caption.translations && typeof caption.translations === 'object' && !Array.isArray(caption.translations) &&
    Object.entries(caption.translations).length <= targets.size &&
    Object.entries(caption.translations).every(([key, value]) => caption.availableTargets.includes(key) && typeof value === 'string' && value.length <= MAX_TEXT_LENGTH) &&
    Buffer.byteLength(JSON.stringify(payload)) <= 60 * 1024;
}

function validTargets(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= targets.size &&
    new Set(value).size === value.length && value.every((target) => typeof target === 'string' && targets.has(target));
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
    return "";
  }
  return /^[A-Z0-9-]{1,32}$/.test(roomId) ? roomId : '';
}
