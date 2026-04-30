import { Languages, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SessionControls } from "./components/SessionControls";
import { SpeakerView } from "./components/SpeakerView";
import {
  createRealtimeConnection,
  normalizeRoomId,
  type CaptionMessage,
  type RealtimeConnection,
} from "./services/realtime";
import {
  startTranslationSession,
  sourceLanguages,
  targetLanguages,
  type RunningTranslationSession,
} from "./services/speechTranslation";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const defaultSpeakerSource = "fr-FR";
const defaultSpeakerTargets = ["en", "nl", "es"];

export function App() {
  const [roomInput, setRoomInput] = useState(() => generateRoomCode());
  const [speakerSource, setSpeakerSource] = useState<string>(defaultSpeakerSource);
  const [speakerTargets, setSpeakerTargets] = useState<string[]>(defaultSpeakerTargets);
  const [previewTarget, setPreviewTarget] = useState<string>(defaultSpeakerTargets[0]);
  const [isListening, setIsListening] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("Ready");
  const [relayStatus, setRelayStatus] = useState("Relay idle");
  const [audienceCount, setAudienceCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const sessionRef = useRef<RunningTranslationSession | null>(null);
  const speakerSocketRef = useRef<RealtimeConnection | null>(null);
  const speakerRoomRef = useRef<string | null>(null);

  const roomId = useMemo(() => normalizeRoomId(roomInput), [roomInput]);

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
      speakerSocketRef.current?.disconnect();
    };
  }, []);

  // Keep preview target valid as the speaker changes targets.
  useEffect(() => {
    if (speakerTargets.length === 0) {
      setPreviewTarget("");
      return;
    }
    if (!speakerTargets.includes(previewTarget)) {
      setPreviewTarget(speakerTargets[0]);
    }
  }, [speakerTargets, previewTarget]);

  async function startListening() {
    if (isBusy || sessionRef.current) {
      return;
    }
    if (speakerTargets.length === 0) {
      setError("Select at least one target language to translate to.");
      return;
    }

    setIsBusy(true);
    setError(null);
    setNotice(null);
    setSpeechStatus("Connecting microphone");
    connectSpeakerRelay();

    const sessionTargets = [...speakerTargets];

    try {
      sessionRef.current = await startTranslationSession({
        apiBaseUrl,
        sourceLanguage: speakerSource,
        targetLanguages: sessionTargets,
        onStatus: setSpeechStatus,
        onError: (message) => {
          setError(message);
          setSpeechStatus("Needs attention");
        },
        onUpdate: (update) => {
          if (update.originalText) {
            setOriginalText(update.originalText);
          }
          if (Object.keys(update.translations).length > 0) {
            setTranslations(update.translations);
          }

          publishCaption({
            roomId,
            sourceLanguage: speakerSource,
            availableTargets: sessionTargets,
            originalText: update.originalText,
            translations: update.translations,
            isFinal: update.reason === "recognized",
            timestamp: new Date().toISOString(),
          });
        },
      });
      setIsListening(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start translation.");
      setSpeechStatus("Needs attention");
    } finally {
      setIsBusy(false);
    }
  }

  async function stopListening() {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    setSpeechStatus("Stopping");
    setError(null);

    try {
      await sessionRef.current?.stop();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to stop translation.");
    } finally {
      sessionRef.current = null;
      setIsListening(false);
      setIsBusy(false);
      setSpeechStatus("Ready");
    }
  }

  function connectSpeakerRelay() {
    const socket = getSpeakerSocket();

    if (speakerRoomRef.current && speakerRoomRef.current !== roomId) {
      socket.emit("leave-room", speakerRoomRef.current);
    }

    speakerRoomRef.current = roomId;
    socket.emit("join-room", roomId, (presence) => {
      setAudienceCount(presence.audienceCount);
      setRelayStatus("Relay connected");
    });
  }

  function publishCaption(caption: CaptionMessage) {
    if (Object.keys(caption.translations).length === 0) {
      return;
    }
    const socket = getSpeakerSocket();
    socket.emit("publish-caption", caption);
  }

  function getSpeakerSocket() {
    if (!speakerSocketRef.current) {
      speakerSocketRef.current = createRealtimeConnection(apiBaseUrl);
      speakerSocketRef.current.on("connect", () => setRelayStatus("Relay connected"));
      speakerSocketRef.current.on("disconnect", () => setRelayStatus("Relay disconnected"));
      speakerSocketRef.current.on("connect_error", () => {
        setRelayStatus("Relay failed");
        setError("Unable to connect to the realtime caption relay.");
      });
      speakerSocketRef.current.on("room-presence", (presence) => {
        if (presence.roomId === roomId) {
          setAudienceCount(presence.audienceCount);
        }
      });
    }

    if (!speakerSocketRef.current.connected) {
      setRelayStatus("Relay connecting");
      speakerSocketRef.current.connect();
    }

    return speakerSocketRef.current;
  }

  function handleRoomInputChange(roomCode: string) {
    setRoomInput(normalizeRoomId(roomCode));
    setNotice(null);
  }

  function handleGenerateRoom() {
    setRoomInput(generateRoomCode());
    setNotice("Room code generated");
  }

  async function handleCopyRoom() {
    try {
      await navigator.clipboard.writeText(roomId);
      setNotice("Room code copied");
    } catch {
      setError("Unable to copy the room code from this browser.");
    }
  }

  function handleSpeakerTargetToggle(code: string) {
    setSpeakerTargets((current) => {
      if (current.includes(code)) {
        return current.filter((entry) => entry !== code);
      }
      return [...current, code];
    });
  }

  function clearSpeakerTranscript() {
    setOriginalText("");
    setTranslations({});
    setNotice("Speaker transcript cleared");
  }

  const controlsLocked = isListening || isBusy;

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

        <SessionControls
          roomInput={roomInput}
          isLocked={controlsLocked}
          onRoomInputChange={handleRoomInputChange}
          onGenerateRoom={handleGenerateRoom}
          onCopyRoom={handleCopyRoom}
          speakerSourceLanguage={speakerSource}
          speakerTargetLanguages={speakerTargets}
          onSpeakerSourceChange={setSpeakerSource}
          onSpeakerTargetToggle={handleSpeakerTargetToggle}
        />

        <div className="room-strip" aria-label="Current room">
          <Send size={16} aria-hidden="true" />
          <span>Broadcasting to</span>
          <code>{roomId}</code>
          <span>{audienceCount} connected</span>
        </div>

        <div className="message-stack" aria-live="polite">
          {notice ? <p className="notice-banner">{notice}</p> : null}
          {error ? <p className="error-banner">{error}</p> : null}
        </div>

        <SpeakerView
          sourceLanguage={speakerSource}
          targetLanguages={speakerTargets}
          previewTarget={previewTarget}
          onPreviewTargetChange={setPreviewTarget}
          originalText={originalText}
          translations={translations}
          isListening={isListening}
          isBusy={isBusy}
          speechStatus={speechStatus}
          relayStatus={relayStatus}
          audienceCount={audienceCount}
          onStart={startListening}
          onStop={stopListening}
          onClear={clearSpeakerTranscript}
        />
      </section>

      <section className="panel config-panel" aria-labelledby="config-title">
        <h2 id="config-title">Local Configuration</h2>
        <dl>
          <div>
            <dt>Backend API</dt>
            <dd>{apiBaseUrl}</dd>
          </div>
          <div>
            <dt>Source languages</dt>
            <dd>{sourceLanguages.map((language) => language.displayName).join(", ")}</dd>
          </div>
          <div>
            <dt>Target languages</dt>
            <dd>{targetLanguages.map((language) => language.displayName).join(", ")}</dd>
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

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomPart = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `LIVE-${randomPart}`;
}
