import { Eraser, Mic, MicOff, Minus, Plus, Radio, Square } from "lucide-react";
import type { FinalizedCaption } from "@live-translation/shared";
import { StatusBadge } from "./StatusBadge";
import {
  getSourceLanguageName,
  getTargetLanguageName,
} from "../services/speechTranslation";

interface SpeakerViewProps {
  sourceLanguage: string;
  targetLanguages: string[];
  previewTarget: string | undefined;
  onPreviewTargetChange: (code: string) => void;
  originalText: string;
  translations: Record<string, string>;
  history: FinalizedCaption[];
  fontScale: number;
  canDecreaseFont: boolean;
  canIncreaseFont: boolean;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
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
  sourceLanguage,
  targetLanguages,
  previewTarget,
  onPreviewTargetChange,
  originalText,
  translations,
  history,
  fontScale,
  canDecreaseFont,
  canIncreaseFont,
  onIncreaseFont,
  onDecreaseFont,
  isListening,
  isBusy,
  speechStatus,
  relayStatus,
  audienceCount,
  onStart,
  onStop,
  onClear,
}: SpeakerViewProps) {
  const activePreview = previewTarget ?? targetLanguages[0];

  return (
    <>
      <div className="action-row">
        <button
          className="primary-action"
          type="button"
          onClick={isListening ? onStop : onStart}
          disabled={isBusy || targetLanguages.length === 0}
          aria-label={isListening ? "Stop translation" : "Start translation"}
        >
          {isListening ? <Square size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
          <span>{isListening ? "Stop" : "Start"}</span>
        </button>
        <button className="secondary-action" type="button" onClick={onClear} disabled={isListening && isBusy}>
          <Eraser size={18} aria-hidden="true" />
          Clear
        </button>
        <div className="font-controls" role="group" aria-label="Text size">
          <span aria-hidden="true">Text size</span>
          <button type="button" onClick={onDecreaseFont} disabled={!canDecreaseFont} aria-label="Decrease text size">
            <Minus size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={onIncreaseFont} disabled={!canIncreaseFont} aria-label="Increase text size">
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="status-grid" aria-label="Speaker status">
        <StatusBadge icon={isListening ? Radio : MicOff} label={speechStatus} state={isListening ? "active" : "idle"} />
        <StatusBadge icon={Radio} label={relayStatus} state={relayStatus === "Relay connected" ? "active" : "idle"} />
        <StatusBadge icon={Radio} label={`${audienceCount} connected`} state={audienceCount > 0 ? "active" : "idle"} />
      </div>

      <section
        className="transcript-grid"
        aria-label="Live translation transcript"
        style={{ "--caption-scale": fontScale } as React.CSSProperties}
      >
        <article className="transcript-panel">
          <div className="transcript-heading">
            <span>{getSourceLanguageName(sourceLanguage)}</span>
            <code>{sourceLanguage}</code>
          </div>
          <p className="transcript-live" data-live={isListening}>
            {originalText || "Waiting for speech"}
          </p>
        </article>

        <article className="transcript-panel translated-panel">
          <div className="transcript-heading">
            <span>{activePreview ? getTargetLanguageName(activePreview) : "No target selected"}</span>
            {activePreview ? <code>{activePreview}</code> : null}
          </div>
          {targetLanguages.length > 1 ? (
            <div className="preview-tabs" aria-label="Preview translations">
              {targetLanguages.map((code) => (
                <button
                  key={code}
                  type="button"
                  data-active={code === activePreview}
                  aria-pressed={code === activePreview}
                  onClick={() => onPreviewTargetChange(code)}
                >
                  {getTargetLanguageName(code)}
                </button>
              ))}
            </div>
          ) : null}
          <p className="transcript-live" data-live={isListening}>
            {(activePreview && translations[activePreview]) || "Waiting for translation"}
          </p>
        </article>
      </section>

      {history.length > 0 ? (
        <section className="transcript-history" aria-label="Finalized transcript history">
          <h2>History</h2>
          <div className="transcript-history-list" style={{ "--caption-scale": fontScale } as React.CSSProperties}>
            {history.map((caption) => {
              const text = activePreview ? caption.translations[activePreview] : "";
              if (!text) {
                return null;
              }
              return (
                <article key={caption.id}>
                  <p>{text}</p>
                  {caption.originalText ? <small>{caption.originalText}</small> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

