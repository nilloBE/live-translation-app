import { ArrowLeft, ArrowRight } from "lucide-react";
import type { AudienceStrings } from "../i18n/strings";

interface RoomPickerProps {
  roomInput: string;
  strings: AudienceStrings;
  onRoomInputChange: (roomCode: string) => void;
  onConnect: () => void;
  onChangeLanguage: () => void;
}

export function RoomPicker({
  roomInput,
  strings,
  onRoomInputChange,
  onConnect,
  onChangeLanguage,
}: RoomPickerProps) {
  return (
    <section className="step-panel" aria-labelledby="room-title">
      <p className="eyebrow">Live Translation</p>
      <h1 id="room-title">{strings.connectToRoom}</h1>
      <p className="supporting-text" id="room-help">{strings.roomCodeHint}</p>
      <form
        className="room-form"
        onSubmit={(event) => {
          event.preventDefault();
          onConnect();
        }}
      >
        <label className="room-field">
          <span>{strings.roomCodeLabel}</span>
          <input
            value={roomInput}
            onChange={(event) => onRoomInputChange(event.target.value)}
            placeholder={strings.roomCodePlaceholder}
            maxLength={16}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="room-help"
            autoFocus
          />
        </label>
        <button className="primary-action" type="submit">
          <span>{strings.connect}</span>
          <ArrowRight aria-hidden="true" size={20} />
        </button>
      </form>
      <button className="text-action" type="button" onClick={onChangeLanguage}>
        <ArrowLeft aria-hidden="true" size={18} />
        <span>{strings.changeLanguage}</span>
      </button>
    </section>
  );
}
