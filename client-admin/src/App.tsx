import { Activity, LogOut, Mic, MicOff, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const adminKeyStorageKey = "live-translation:admin-key";

interface AdminRoomSnapshot {
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

interface AdminSnapshot {
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

type ConnectionStatus = "connecting" | "connected" | "unauthorized" | "disconnected";

export function App() {
  const [apiKey, setApiKey] = useState<string>(() => loadStoredKey());
  const [keyDraft, setKeyDraft] = useState("");
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    setStatus("connecting");
    setSnapshot(null);

    const socket: Socket = io(`${apiBaseUrl}/admin`, {
      auth: { key: apiKey },
    });

    socket.on("connect", () => setStatus("connected"));
    socket.on("metrics", (payload: AdminSnapshot) => setSnapshot(payload));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", () => {
      setStatus("unauthorized");
      socket.disconnect();
    });

    return () => {
      socket.disconnect();
    };
  }, [apiKey]);

  function handleConnect() {
    const trimmed = keyDraft.trim();
    if (!trimmed) {
      return;
    }
    writeStoredKey(trimmed);
    setApiKey(trimmed);
    setKeyDraft("");
  }

  function handleSignOut() {
    clearStoredKey();
    setApiKey("");
    setSnapshot(null);
    setStatus("connecting");
  }

  if (!apiKey) {
    return (
      <main className="admin-shell admin-shell-centered">
        <KeyPrompt keyDraft={keyDraft} onKeyDraftChange={setKeyDraft} onSubmit={handleConnect} />
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Live Translation Admin</h1>
        </div>
        <div className="header-actions">
          <StatusPill status={status} />
          <button type="button" className="secondary-action" onClick={handleSignOut}>
            <LogOut size={16} aria-hidden="true" />
            Change key
          </button>
        </div>
      </header>

      {status === "unauthorized" ? (
        <p className="error-banner">
          That admin key was rejected. Check the ADMIN_API_KEY configured on the server and try again.
        </p>
      ) : null}

      {!snapshot ? (
        <p className="notice-banner">Waiting for the first metrics snapshot…</p>
      ) : (
        <Dashboard snapshot={snapshot} />
      )}
    </main>
  );
}

function Dashboard({ snapshot }: { snapshot: AdminSnapshot }) {
  const now = useMemo(() => new Date(snapshot.serverTime).getTime(), [snapshot.serverTime]);

  return (
    <>
      <section className="summary-grid" aria-label="Summary metrics">
        <SummaryCard icon={<Activity size={20} aria-hidden="true" />} label="Active rooms" value={String(snapshot.activeRoomCount)} />
        <SummaryCard
          icon={<Users size={20} aria-hidden="true" />}
          label="Current connections"
          value={String(snapshot.currentConnections)}
        />
        <SummaryCard label="Connections since start" value={String(snapshot.totalConnectionsEver)} />
        <SummaryCard label="Captions relayed" value={String(snapshot.totalCaptionsRelayed)} />
        <SummaryCard label="Rejected messages" value={String(snapshot.rejectedPublishCount)} warn={snapshot.rejectedPublishCount > 0} />
        <SummaryCard label="Server uptime" value={formatDuration(snapshot.uptimeSeconds)} />
        <SummaryCard label="Memory (RSS)" value={`${snapshot.memory.rssMb} MB`} />
        <SummaryCard label="Memory (heap used)" value={`${snapshot.memory.heapUsedMb} MB`} />
      </section>

      <section className="panel rooms-panel" aria-label="Active rooms">
        <h2>Rooms</h2>
        {snapshot.rooms.length === 0 ? (
          <p className="notice-banner">No active rooms right now.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Room</th>
                  <th scope="col">Speaker</th>
                  <th scope="col">Source</th>
                  <th scope="col">Targets</th>
                  <th scope="col">Connections</th>
                  <th scope="col">Peak</th>
                  <th scope="col">Captions</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rooms.map((room) => (
                  <tr key={room.roomId}>
                    <td>
                      <code>{room.roomId}</code>
                    </td>
                    <td>
                      {room.hasSpeaker ? (
                        <span className="status-pill" data-state="active">
                          <Mic size={14} aria-hidden="true" /> Live
                        </span>
                      ) : (
                        <span className="status-pill" data-state="warning">
                          <MicOff size={14} aria-hidden="true" /> None
                        </span>
                      )}
                    </td>
                    <td>{room.sourceLanguage ?? "—"}</td>
                    <td>{room.targetLanguages.length > 0 ? room.targetLanguages.join(", ") : "—"}</td>
                    <td>{room.connectionCount}</td>
                    <td>{room.peakConnectionCount}</td>
                    <td>{room.captionCount}</td>
                    <td>{formatRelativeTime(room.createdAt, now)}</td>
                    <td>{formatRelativeTime(room.lastActivityAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="refresh-note">
        <RefreshCw size={14} aria-hidden="true" /> Updates automatically every few seconds. Server time:{" "}
        {new Date(snapshot.serverTime).toLocaleTimeString()}
      </p>
    </>
  );
}

function KeyPrompt({
  keyDraft,
  onKeyDraftChange,
  onSubmit,
}: {
  keyDraft: string;
  onKeyDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="panel key-prompt">
      <p className="eyebrow">Operations</p>
      <h1>Live Translation Admin</h1>
      <p className="key-prompt-hint">Enter the admin dashboard key configured on the server (ADMIN_API_KEY).</p>
      <form
        className="key-prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          type="password"
          value={keyDraft}
          onChange={(event) => onKeyDraftChange(event.target.value)}
          placeholder="Admin key"
          autoFocus
        />
        <button type="submit" className="primary-action">
          Connect
        </button>
      </form>
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  warn,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="summary-card" data-warn={warn ? "true" : undefined}>
      {icon ? <span className="summary-icon">{icon}</span> : null}
      <span className="summary-value">{value}</span>
      <span className="summary-label">{label}</span>
    </div>
  );
}

function StatusPill({ status }: { status: ConnectionStatus }) {
  const labels: Record<ConnectionStatus, string> = {
    connecting: "Connecting…",
    connected: "Live",
    unauthorized: "Unauthorized",
    disconnected: "Disconnected",
  };
  const state = status === "connected" ? "active" : status === "unauthorized" ? "warning" : undefined;

  return (
    <span className="status-pill" data-state={state}>
      {labels[status]}
    </span>
  );
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function formatRelativeTime(iso: string, nowMs: number) {
  const thenMs = new Date(iso).getTime();
  if (Number.isNaN(thenMs)) {
    return "—";
  }
  const diffSeconds = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}h ago`;
}

function loadStoredKey() {
  try {
    return window.localStorage.getItem(adminKeyStorageKey) ?? "";
  } catch {
    return "";
  }
}

function writeStoredKey(value: string) {
  try {
    window.localStorage.setItem(adminKeyStorageKey, value);
  } catch {
    // Ignore storage errors in private browsing modes.
  }
}

function clearStoredKey() {
  try {
    window.localStorage.removeItem(adminKeyStorageKey);
  } catch {
    // Ignore storage errors in private browsing modes.
  }
}
