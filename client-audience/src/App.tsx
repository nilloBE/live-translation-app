import { useEffect, useMemo, useState } from "react";
import {
  normalizeRoomId,
} from "@live-translation/shared";
import { LanguagePicker } from "./components/LanguagePicker";
import { AudienceHelp } from "./components/AudienceHelp";
import { buildTargetOptions, LiveCaptionsView } from "./components/LiveCaptionsView";
import { RoomPicker } from "./components/RoomPicker";
import {
  defaultTargetForLanguage,
  useAudiencePreferences,
} from "./hooks/useAudiencePreferences";
import { useAudienceRoom } from "./hooks/useAudienceRoom";
import { strings, uiLanguages, type UiLanguage } from "./i18n/strings";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type AudienceStep = "language" | "room" | "live";

export function App() {
  const preferences = useAudiencePreferences();
  const [step, setStep] = useState<AudienceStep>(() =>
    preferences.uiLanguage ? "room" : "language",
  );

  const activeStrings = strings[preferences.uiLanguage ?? "en"];
  const roomId = useMemo(() => normalizeRoomId(preferences.roomInput), [preferences.roomInput]);
  const room = useAudienceRoom(apiBaseUrl, roomId, step === "live");
  const { captionStream } = room;
  const latestCaption = captionStream.latest ?? undefined;
  const targetOptions = useMemo(() => buildTargetOptions(latestCaption), [latestCaption]);

  useEffect(() => {
    if (targetOptions.includes(preferences.selectedTarget)) {
      return;
    }
    const languageDefault = defaultTargetForLanguage(preferences.uiLanguage);
    preferences.setSelectedTarget(
      targetOptions.includes(languageDefault) ? languageDefault : targetOptions[0],
    );
  }, [preferences.selectedTarget, preferences.setSelectedTarget, targetOptions, preferences.uiLanguage]);

  function handleSelectLanguage(language: UiLanguage) {
    preferences.setUiLanguage(language);
    preferences.setSelectedTarget(defaultTargetForLanguage(language));
    setStep("room");
  }

  function handleRoomInputChange(value: string) {
    preferences.setRoomInput(normalizeRoomId(value));
  }

  function handleConnect() {
    preferences.setRoomInput(roomId);
    setStep("live");
  }

  function handleLeaveRoom() {
    setStep("room");
    room.clearCaptions();
  }

  function handleChangeLanguage() {
    setStep("language");
  }

  return (
    <main className="audience-app">
      {step !== "live" ? (
        <div className="setup-help">
          <AudienceHelp
            language={preferences.uiLanguage ?? "en"}
            theme={preferences.theme}
            strings={activeStrings}
            showLabel
          />
        </div>
      ) : null}
      {step === "language" ? (
        <LanguagePicker
          strings={activeStrings}
          selectedLanguage={preferences.uiLanguage}
          onSelect={handleSelectLanguage}
        />
      ) : null}

      {step === "room" ? (
        <RoomPicker
          roomInput={preferences.roomInput}
          strings={activeStrings}
          onRoomInputChange={handleRoomInputChange}
          onConnect={handleConnect}
          onChangeLanguage={handleChangeLanguage}
        />
      ) : null}

      {step === "live" ? (
        <LiveCaptionsView
          roomId={roomId}
          uiLanguage={preferences.uiLanguage ?? "en"}
          live={captionStream.live}
          latestCaption={latestCaption}
          history={captionStream.history}
          connectionStatus={room.connectionStatus}
          audienceCount={room.audienceCount}
          selectedTarget={preferences.selectedTarget}
          targetOptions={targetOptions}
          fontScale={preferences.fontScale}
          canDecreaseFont={preferences.canDecreaseFont}
          canIncreaseFont={preferences.canIncreaseFont}
          theme={preferences.theme}
          strings={activeStrings}
          onSelectedTargetChange={preferences.setSelectedTarget}
          onIncreaseFont={preferences.increaseFont}
          onDecreaseFont={preferences.decreaseFont}
          onThemeChange={preferences.setTheme}
          onLeaveRoom={handleLeaveRoom}
          onChangeLanguage={handleChangeLanguage}
        />
      ) : null}
    </main>
  );
}
