import { Languages, Mic, MicOff, Radio, Square, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  startTranslationSession,
  translationPairs,
  type RunningTranslationSession,
  type TranslationPairId,
} from "./services/speechTranslation";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function App() {
  const [selectedPairId, setSelectedPairId] = useState<TranslationPairId>("fr-nl");
  const [isListening, setIsListening] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const sessionRef = useRef<RunningTranslationSession | null>(null);

  const selectedPair = useMemo(
    () => translationPairs.find((pair) => pair.id === selectedPairId) ?? translationPairs[0],
    [selectedPairId],
  );

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
    };
  }, []);

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

        <div className="control-bar" aria-label="Translation controls">
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
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

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
            <dt>Authentication</dt>
            <dd>Microsoft Entra ID via Azure CLI locally and managed identity in Azure</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
