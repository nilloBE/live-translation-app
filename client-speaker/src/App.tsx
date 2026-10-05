import { Languages, Monitor, Moon, Send, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  captionFontScales,
  clampFontScaleIndex,
  createCaptionStreamState,
  defaultCaptionFontScaleIndex,
  downloadTranscript,
  englishTranscriptLabels,
  formatTranscriptText,
  reduceCaptionStream,
} from "@live-translation/shared";
import { SessionControls } from "./components/SessionControls";
import { SpeakerView } from "./components/SpeakerView";
import {
  createSpeakerRelay,
  normalizeRoomId,
  type CaptionMessage,
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
const fontStorageKey = "live-translation:speaker-font";
const glossaryStorageKey = "live-translation:speaker-glossary";
const themeStorageKey = "live-translation:speaker-theme";
const maxGlossaryPhrases = 500;
const defaultGlossaryText = [
  "VASCAPA",
  "CMV",
  "Saint-Luc",
  "VASCERN",
  "ERN",
  "EURORDIS",
  "RaDiOrg",
  "LUSS",
  "MAV",
  "h\u00e9mangiome",
  "h\u00e9mangioendoth\u00e9liome",
  "kaposiforme",
  "propranolol",
  "rapamycine",
  "scl\u00e9roth\u00e9rapie",
  "lymphangiome",
  "t\u00e9langiectasique",
  "Klippel-Tr\u00e9naunay",
  "glomangiome",
  "phl\u00e9bolithes",
].join("\n");
const captionHistoryLimit = 100;
type ThemePreference = "system" | "light" | "dark";

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
  const [captionStream, setCaptionStream] = useState(createCaptionStreamState);
  const [fontIndex, setFontIndex] = useState(() => loadFontIndex());
  const [glossaryText, setGlossaryText] = useState(() => loadGlossary());
  const [theme, setTheme] = useState<ThemePreference>(loadTheme);
  const sessionRef = useRef<RunningTranslationSession | null>(null);
  const relayRef = useRef<ReturnType<typeof createSpeakerRelay> | null>(null);

  const roomId = useMemo(() => normalizeRoomId(roomInput), [roomInput]);

  useEffect(() => {
    writeStoredValue(fontStorageKey, String(fontIndex));
  }, [fontIndex]);

  useEffect(() => {
    writeStoredValue(glossaryStorageKey, glossaryText);
  }, [glossaryText]);

  useEffect(() => {
    writeStoredValue(themeStorageKey, theme);
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
      relayRef.current?.stop();
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

    const sessionTargets = [...speakerTargets];

    try {
      relayRef.current ??= createSpeakerRelay(apiBaseUrl, setRelayStatus, setAudienceCount, setError);
      await relayRef.current.start({ roomId, sourceLanguage: speakerSource, targetLanguages: sessionTargets });
      sessionRef.current = await startTranslationSession({
        apiBaseUrl,
        sourceLanguage: speakerSource,
        targetLanguages: sessionTargets,
        phrases: parseGlossary(glossaryText),
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

          const caption: CaptionMessage = {
            roomId,
            sourceLanguage: speakerSource,
            availableTargets: sessionTargets,
            originalText: update.originalText,
            translations: update.translations,
            isFinal: update.reason === "recognized",
            timestamp: new Date().toISOString(),
          };

          if (update.originalText || Object.keys(update.translations).length > 0) {
            setCaptionStream((current) => reduceCaptionStream(current, caption, captionHistoryLimit));
          }

          relayRef.current?.publish(caption);
        },
      });
      setIsListening(true);
    } catch (caughtError) {
      relayRef.current?.stop();
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
      relayRef.current?.stop();
      setIsListening(false);
      setIsBusy(false);
      setSpeechStatus("Ready");
    }
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
    setCaptionStream(createCaptionStreamState());
    setNotice("Speaker transcript cleared");
  }

  function handleDownloadTranscript() {
    const targetLanguage = previewTarget || speakerTargets[0] || "";
    downloadTranscript(formatTranscriptText({
      history: captionStream.history,
      live: captionStream.live,
      targetLanguage,
      labels: englishTranscriptLabels,
    }), roomId, targetLanguage);
  }

  function handleIncreaseFont() {
    setFontIndex((current) => clampFontScaleIndex(current + 1));
  }

  function handleDecreaseFont() {
    setFontIndex((current) => clampFontScaleIndex(current - 1));
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
            <p className="ai-disclaimer">{englishTranscriptLabels.aiDisclaimer}</p>
          </div>
          <div className="theme-controls" role="group" aria-label="Theme">
            <ThemeButton label="Use system theme" active={theme === "system"} onClick={() => setTheme("system")}>
              <Monitor aria-hidden="true" size={18} />
            </ThemeButton>
            <ThemeButton label="Use light theme" active={theme === "light"} onClick={() => setTheme("light")}>
              <Sun aria-hidden="true" size={18} />
            </ThemeButton>
            <ThemeButton label="Use dark theme" active={theme === "dark"} onClick={() => setTheme("dark")}>
              <Moon aria-hidden="true" size={18} />
            </ThemeButton>
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
          glossaryText={glossaryText}
          onGlossaryChange={setGlossaryText}
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
          history={captionStream.history}
          fontScale={captionFontScales[fontIndex]}
          canDecreaseFont={fontIndex > 0}
          canIncreaseFont={fontIndex < captionFontScales.length - 1}
          onIncreaseFont={handleIncreaseFont}
          onDecreaseFont={handleDecreaseFont}
          isListening={isListening}
          isBusy={isBusy}
          speechStatus={speechStatus}
          relayStatus={relayStatus}
          audienceCount={audienceCount}
          onStart={startListening}
          onStop={stopListening}
          onClear={clearSpeakerTranscript}
          onDownload={handleDownloadTranscript}
          canDownload={captionStream.history.length > 0 || Boolean(originalText) || Object.values(translations).some(Boolean)}
        />
      </section>

      <details className="panel config-panel">
        <summary id="config-title">Local configuration</summary>
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
      </details>
    </main>
  );
}

function ThemeButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-active={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomPart = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `LIVE-${randomPart}`;
}

function loadFontIndex() {
  try {
    const stored = window.localStorage.getItem(fontStorageKey);
    return stored === null ? defaultCaptionFontScaleIndex : clampFontScaleIndex(Number(stored));
  } catch {
    return defaultCaptionFontScaleIndex;
  }
}

function loadGlossary() {
  try {
    return window.localStorage.getItem(glossaryStorageKey) ?? defaultGlossaryText;
  } catch {
    return defaultGlossaryText;
  }
}

function loadTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function parseGlossary(text: string) {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    phrases.push(trimmed);
    if (phrases.length >= maxGlossaryPhrases) {
      break;
    }
  }
  return phrases;
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in private browsing modes.
  }
}
