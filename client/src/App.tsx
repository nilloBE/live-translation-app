import { Captions, Languages, Mic, MicOff, Radio, Send, Square, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createRealtimeConnection,
  normalizeRoomId,
  type CaptionMessage,
  type RealtimeConnection,
} from "./services/realtime";
import {
  startTranslationSession,
  translationPairs,
  type RunningTranslationSession,
  type TranslationPairId,
} from "./services/speechTranslation";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
type AppView = "speaker" | "audience";

export function App() {
  const [activeView, setActiveView] = useState<AppView>("speaker");
  const [roomInput, setRoomInput] = useState("LIVE");
  const [selectedPairId, setSelectedPairId] = useState<TranslationPairId>("fr-nl");
  const [isListening, setIsListening] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [audienceStatus, setAudienceStatus] = useState("Disconnected");
  const [audienceCount, setAudienceCount] = useState(0);
  const [captions, setCaptions] = useState<CaptionMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const sessionRef = useRef<RunningTranslationSession | null>(null);
  const speakerSocketRef = useRef<RealtimeConnection | null>(null);
  const audienceSocketRef = useRef<RealtimeConnection | null>(null);

  const roomId = useMemo(() => normalizeRoomId(roomInput), [roomInput]);

  const selectedPair = useMemo(
    () => translationPairs.find((pair) => pair.id === selectedPairId) ?? translationPairs[0],
    [selectedPairId],
  );

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
      speakerSocketRef.current?.disconnect();
      audienceSocketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (activeView !== "audience") {
      return;
    }

    const socket = createRealtimeConnection(apiBaseUrl);
    audienceSocketRef.current = socket;
    setAudienceStatus("Connecting");
    setCaptions([]);

    socket.on("connect", () => {
      socket.emit("join-room", roomId, (presence) => {
        setAudienceCount(presence.audienceCount);
        setAudienceStatus(`Joined ${presence.roomId}`);
      });
    });

    socket.on("connect_error", () => {
      setAudienceStatus("Connection failed");
    });

    socket.on("room-presence", (presence) => {
      if (presence.roomId === roomId) {
        setAudienceCount(presence.audienceCount);
      }
    });

    socket.on("caption", (caption) => {
      setCaptions((currentCaptions) => [caption, ...currentCaptions].slice(0, 8));
    });

    socket.connect();

    return () => {
      socket.emit("leave-room", roomId);
      socket.disconnect();
      audienceSocketRef.current = null;
      setAudienceStatus("Disconnected");
    };
  }, [activeView, roomId]);

  async function startListening() {
    if (isBusy || sessionRef.current) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatus("Connecting");

    try {
      sessionRef.current = await startTranslationSession({
        apiBaseUrl,
        pair: selectedPair,
        onStatus: setStatus,
        onError: (message) => {
          setError(message);
          setStatus("Needs attention");
        },
        onUpdate: (update) => {
          if (update.originalText) {
            setOriginalText(update.originalText);
          }

          if (update.translatedText) {
            setTranslatedText(update.translatedText);
          }

          publishCaption({
            roomId,
            sourceLanguage: selectedPair.sourceLanguage,
            targetLanguage: selectedPair.targetLanguage,
            originalText: update.originalText,
            translatedText: update.translatedText,
            isFinal: update.reason === "recognized",
            timestamp: new Date().toISOString(),
          });
        },
      });
      setIsListening(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start translation.");
      setStatus("Needs attention");
    } finally {
      setIsBusy(false);
    }
  }

  async function stopListening() {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    setStatus("Stopping");
    setError(null);

    try {
      await sessionRef.current?.stop();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to stop translation.");
    } finally {
      sessionRef.current = null;
      setIsListening(false);
      setIsBusy(false);
      setStatus("Ready");
    }
  }

  function publishCaption(caption: CaptionMessage) {
    if (!caption.translatedText) {
      return;
    }

    const socket = getSpeakerSocket();
    socket.emit("publish-caption", caption);
  }

  function getSpeakerSocket() {
    if (!speakerSocketRef.current) {
      speakerSocketRef.current = createRealtimeConnection(apiBaseUrl);
      speakerSocketRef.current.on("connect_error", () => {
        setError("Unable to connect to the realtime caption relay.");
      });
    }

    if (!speakerSocketRef.current.connected) {
      speakerSocketRef.current.connect();
    }

    return speakerSocketRef.current;
  }

  return (
    <main className="app-shell">
      <section className="speaker-surface" aria-labelledby="app-title">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">
            <Languages size={28} />
          </span>
          <div>
            <p className="eyebrow">Speaker console</p>
            <h1 id="app-title">Live Translation App</h1>
          </div>
        </div>

        <div className="view-switch" aria-label="Live translation views">
          <button
            type="button"
            data-active={activeView === "speaker"}
            onClick={() => setActiveView("speaker")}
          >
            <Mic size={18} aria-hidden="true" />
            Speaker
          </button>
          <button
            type="button"
            data-active={activeView === "audience"}
            onClick={() => setActiveView("audience")}
          >
            <Users size={18} aria-hidden="true" />
            Audience
          </button>
        </div>

        <div className="control-bar" aria-label="Session controls">
          <label className="room-input">
            <span>Room code</span>
            <input
              value={roomInput}
              onChange={(event) => setRoomInput(event.target.value)}
              disabled={isListening}
              maxLength={16}
            />
          </label>

          <label className="pair-select">
            <span>Translation pair</span>
            <select
              value={selectedPairId}
              onChange={(event) => setSelectedPairId(event.target.value as TranslationPairId)}
              disabled={isListening || isBusy}
            >
              {translationPairs.map((pair) => (
                <option key={pair.id} value={pair.id}>
                  {pair.label}
                </option>
              ))}
            </select>
          </label>

          {activeView === "speaker" ? (
            <div className="action-row">
              <button
                className="primary-action"
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={isBusy}
                aria-label={isListening ? "Stop translation" : "Start translation"}
              >
                {isListening ? <Square size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
                <span>{isListening ? "Stop" : "Start"}</span>
              </button>
              <span className="status-pill" data-state={isListening ? "active" : "idle"}>
                {isListening ? <Radio size={16} aria-hidden="true" /> : <MicOff size={16} aria-hidden="true" />}
                {status}
              </span>
            </div>
          ) : (
            <span className="status-pill" data-state={audienceStatus.startsWith("Joined") ? "active" : "idle"}>
              <Captions size={16} aria-hidden="true" />
              {audienceStatus}
            </span>
          )}
        </div>

        <div className="room-strip" aria-label="Current room">
          <Send size={16} aria-hidden="true" />
          <span>{activeView === "speaker" ? "Broadcasting to" : "Watching"}</span>
          <code>{roomId}</code>
          {activeView === "audience" ? <span>{audienceCount} connected</span> : null}
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        {activeView === "speaker" ? (
          <section className="transcript-grid" aria-label="Live translation transcript">
            <article className="transcript-panel">
              <div className="transcript-heading">
                <span>{selectedPair.sourceName}</span>
                <code>{selectedPair.sourceLanguage}</code>
              </div>
              <p>{originalText || "Waiting for speech"}</p>
            </article>

            <article className="transcript-panel translated-panel">
              <div className="transcript-heading">
                <span>{selectedPair.targetName}</span>
                <code>{selectedPair.targetLanguage}</code>
              </div>
              <p>{translatedText || "Waiting for translation"}</p>
            </article>
          </section>
        ) : (
          <section className="audience-stage" aria-label="Audience captions">
            <p className="subtitle-text">{captions[0]?.translatedText || "Waiting for live captions"}</p>
            <div className="caption-history" aria-label="Recent captions">
              {captions.map((caption) => (
                <article key={`${caption.timestamp}-${caption.translatedText}`}>
                  <span>{caption.isFinal ? "Final" : "Live"}</span>
                  <p>{caption.translatedText}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>

      <section className="panel config-panel" aria-labelledby="config-title">
        <h2 id="config-title">Local Configuration</h2>
        <dl>
          <div>
            <dt>Backend API</dt>
            <dd>{apiBaseUrl}</dd>
          </div>
          <div>
            <dt>Translation pairs</dt>
            <dd>{translationPairs.map((pair) => pair.label).join(", ")}</dd>
          </div>
          <div>
            <dt>Realtime room</dt>
            <dd>{roomId}</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Microsoft Entra ID via Azure CLI locally and managed identity in Azure</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
