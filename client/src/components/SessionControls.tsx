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
  // Speaker selections
  speakerSourceLanguage?: string;
  speakerTargetLanguages?: string[];
  onSpeakerSourceChange?: (code: string) => void;
  onSpeakerTargetToggle?: (code: string) => void;
  // Audience selection
  audienceTargetLanguage?: string;
  audienceTargetOptions?: string[];
  onAudienceTargetChange?: (code: string) => void;
  view: "speaker" | "audience";
  children?: ReactNode;
}

export function SessionControls({
  roomInput,
  isLocked,
  onRoomInputChange,
  onGenerateRoom,
  onCopyRoom,
  speakerSourceLanguage,
  speakerTargetLanguages,
  onSpeakerSourceChange,
  onSpeakerTargetToggle,
  audienceTargetLanguage,
  audienceTargetOptions,
  onAudienceTargetChange,
  view,
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

      {view === "speaker" ? (
        <SpeakerLanguageControls
          sourceLanguage={speakerSourceLanguage ?? sourceLanguages[0].code}
          selectedTargets={speakerTargetLanguages ?? []}
          isLocked={isLocked}
          onSourceChange={onSpeakerSourceChange ?? (() => {})}
          onTargetToggle={onSpeakerTargetToggle ?? (() => {})}
        />
      ) : (
        <AudienceLanguageControl
          target={audienceTargetLanguage}
          options={audienceTargetOptions ?? []}
          onChange={onAudienceTargetChange ?? (() => {})}
        />
      )}

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
                aria-pressed={isActive}
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

interface AudienceLanguageControlProps {
  target?: string;
  options: string[];
  onChange: (code: string) => void;
}

function AudienceLanguageControl({ target, options, onChange }: AudienceLanguageControlProps) {
  const knownOptions = options.length > 0 ? options : targetLanguages.map((language) => language.code);

  return (
    <label className="pair-select">
      <span>Read in</span>
      <select
        value={target ?? knownOptions[0] ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {knownOptions.map((code) => {
          const language = targetLanguages.find((entry) => entry.code === code);
          return (
            <option key={code} value={code}>
              {language ? `${language.displayName} (${code})` : code}
            </option>
          );
        })}
      </select>
    </label>
  );
}
