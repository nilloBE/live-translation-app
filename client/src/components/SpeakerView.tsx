import { Eraser, Mic, MicOff, Radio, Square } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { TranslationPair } from "../services/speechTranslation";

interface SpeakerViewProps {
  selectedPair: TranslationPair;
  originalText: string;
  translatedText: string;
  isListening: boolean;
  isBusy: boolean;
  speechStatus: string;
  relayStatus: string;
  audienceCount: number;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
}

export function SpeakerView({
  selectedPair,
  originalText,
  translatedText,
  isListening,
  isBusy,
  speechStatus,
  relayStatus,
  audienceCount,
  onStart,
  onStop,
  onClear,
}: SpeakerViewProps) {
  return (
    <>
      <div className="action-row">
        <button
          className="primary-action"
          type="button"
          onClick={isListening ? onStop : onStart}
          disabled={isBusy}
          aria-label={isListening ? "Stop translation" : "Start translation"}
        >
          {isListening ? <Square size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
          <span>{isListening ? "Stop" : "Start"}</span>
        </button>
        <button className="secondary-action" type="button" onClick={onClear} disabled={isListening && isBusy}>
          <Eraser size={18} aria-hidden="true" />
          Clear
        </button>
      </div>

      <div className="status-grid" aria-label="Speaker status">
        <StatusBadge icon={isListening ? Radio : MicOff} label={speechStatus} state={isListening ? "active" : "idle"} />
        <StatusBadge icon={Radio} label={relayStatus} state={relayStatus === "Relay connected" ? "active" : "idle"} />
        <StatusBadge icon={Radio} label={`${audienceCount} connected`} state={audienceCount > 0 ? "active" : "idle"} />
      </div>

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
    </>
  );
}