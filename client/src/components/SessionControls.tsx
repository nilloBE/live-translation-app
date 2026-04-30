import { Copy, Shuffle } from "lucide-react";
import type { ReactNode } from "react";
import { translationPairs, type TranslationPairId } from "../services/speechTranslation";

interface SessionControlsProps {
  roomInput: string;
  selectedPairId: TranslationPairId;
  isLocked: boolean;
  onRoomInputChange: (roomCode: string) => void;
  onGenerateRoom: () => void;
  onCopyRoom: () => void;
  onPairChange: (pairId: TranslationPairId) => void;
  children: ReactNode;
}

export function SessionControls({
  roomInput,
  selectedPairId,
  isLocked,
  onRoomInputChange,
  onGenerateRoom,
  onCopyRoom,
  onPairChange,
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

      <label className="pair-select">
        <span>Translation pair</span>
        <select
          value={selectedPairId}
          onChange={(event) => onPairChange(event.target.value as TranslationPairId)}
          disabled={isLocked}
        >
          {translationPairs.map((pair) => (
            <option key={pair.id} value={pair.id}>
              {pair.label}
            </option>
          ))}
        </select>
      </label>

      {children}
    </div>
  );
}