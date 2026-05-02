import { Copy, Shuffle } from "lucide-react";
import type { ReactNode } from "react";
import {
  sourceLanguages,
  targetLanguages,
  type SourceLanguage,
  type TargetLanguage,
} from "../services/speechTranslation";

interface SessionControlsProps {
  roomInput: string;
  isLocked: boolean;
  onRoomInputChange: (roomCode: string) => void;
  onGenerateRoom: () => void;
  onCopyRoom: () => void;
  phraseHintsText?: string;
  onPhraseHintsTextChange?: (value: string) => void;
  speakerSourceLanguage?: string;
  speakerTargetLanguages?: string[];
  onSpeakerSourceChange?: (code: string) => void;
  onSpeakerTargetToggle?: (code: string) => void;
  children?: ReactNode;
}

export function SessionControls({
  roomInput,
  isLocked,
  onRoomInputChange,
  onGenerateRoom,
  onCopyRoom,
  phraseHintsText,
  onPhraseHintsTextChange,
  speakerSourceLanguage,
  speakerTargetLanguages,
  onSpeakerSourceChange,
  onSpeakerTargetToggle,
  children,
}: SessionControlsProps) {
  return (
    <div className="control-bar" aria-label="Session controls">
      <label className="room-input">
        <span>Room code</span>
        <span className="inline-field">
          <input
            value={roomInput}
            onChange={(event) => onRoomInputChange(event.target.value)}
            disabled={isLocked}
            maxLength={16}
          />
          <button type="button" onClick={onGenerateRoom} disabled={isLocked} aria-label="Generate room code">
            <Shuffle size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={onCopyRoom} aria-label="Copy room code">
            <Copy size={18} aria-hidden="true" />
          </button>
        </span>
      </label>

      <SpeakerLanguageControls
        sourceLanguage={speakerSourceLanguage ?? sourceLanguages[0].code}
        selectedTargets={speakerTargetLanguages ?? []}
        isLocked={isLocked}
        onSourceChange={onSpeakerSourceChange ?? (() => {})}
        onTargetToggle={onSpeakerTargetToggle ?? (() => {})}
      />

      <label className="phrase-hints-field">
        <span>Phrase hints</span>
        <textarea
          value={phraseHintsText ?? ""}
          onChange={(event) => onPhraseHintsTextChange?.(event.target.value)}
          disabled={isLocked}
          rows={4}
          placeholder="One phrase per line"
        />
        <small>One phrase per line</small>
      </label>

      {children}
    </div>
  );
}

interface SpeakerLanguageControlsProps {
  sourceLanguage: string;
  selectedTargets: string[];
  isLocked: boolean;
  onSourceChange: (code: string) => void;
  onTargetToggle: (code: string) => void;
}

function SpeakerLanguageControls({
  sourceLanguage,
  selectedTargets,
  isLocked,
  onSourceChange,
  onTargetToggle,
}: SpeakerLanguageControlsProps) {
  return (
    <>
      <label className="pair-select">
        <span>I speak</span>
        <select
          value={sourceLanguage}
          onChange={(event) => onSourceChange(event.target.value)}
          disabled={isLocked}
        >
          {sourceLanguages.map((language: SourceLanguage) => (
            <option key={language.code} value={language.code}>
              {language.displayName} ({language.code})
            </option>
          ))}
        </select>
      </label>

      <fieldset className="target-multiselect" disabled={isLocked}>
        <legend>Translate to</legend>
        <div className="chip-group" role="group" aria-label="Target languages">
          {targetLanguages.map((language: TargetLanguage) => {
            const isActive = selectedTargets.includes(language.code);
            return (
              <button
                key={language.code}
                type="button"
                className="chip"
                data-active={isActive}
                onClick={() => onTargetToggle(language.code)}
              >
                {language.displayName}
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}

