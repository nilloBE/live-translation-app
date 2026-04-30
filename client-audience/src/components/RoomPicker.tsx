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
      <p className="eyebrow">Audience</p>
      <h1 id="room-title">{strings.connectToRoom}</h1>
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
            autoFocus
          />
        </label>
        <button className="primary-action" type="submit">
          {strings.connect}
        </button>
      </form>
      <button className="text-action" type="button" onClick={onChangeLanguage}>
        {strings.changeLanguage}
      </button>
    </section>
  );
}
