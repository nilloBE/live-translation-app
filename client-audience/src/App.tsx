import { useEffect, useMemo, useRef, useState } from "react";
import {
  captionFontScales,
  clampFontScaleIndex,
  createCaptionStreamState,
  defaultCaptionFontScaleIndex,
  createRealtimeConnection,
  normalizeRoomId,
  reduceCaptionStream,
  type RealtimeConnection,
} from "@live-translation/shared";
import { LanguagePicker } from "./components/LanguagePicker";
import { buildTargetOptions, LiveCaptionsView } from "./components/LiveCaptionsView";
import { RoomPicker } from "./components/RoomPicker";
import { strings, uiLanguages, type UiLanguage } from "./i18n/strings";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const uiLanguageStorageKey = "live-translation:audience-ui-lang";
const roomStorageKey = "live-translation:audience-room";
const targetStorageKey = "live-translation:audience-target";
const fontStorageKey = "live-translation:audience-font";
const captionHistoryLimit = 100;

type AudienceStep = "language" | "room" | "live";
type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";

export function App() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage | null>(() => loadUiLanguage());
  const [step, setStep] = useState<AudienceStep>(() => (loadUiLanguage() ? "room" : "language"));
  const [roomInput, setRoomInput] = useState(() => loadStoredValue(roomStorageKey) || "LIVE");
  const [captionStream, setCaptionStream] = useState(createCaptionStreamState);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [audienceCount, setAudienceCount] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState(() => loadStoredValue(targetStorageKey) || defaultTargetForLanguage(loadUiLanguage()));
  const [fontIndex, setFontIndex] = useState(() => loadFontIndex());
  const socketRef = useRef<RealtimeConnection | null>(null);

  const activeStrings = strings[uiLanguage ?? "en"];
  const roomId = useMemo(() => normalizeRoomId(roomInput), [roomInput]);
  const latestCaption = captionStream.latest ?? undefined;
  const targetOptions = useMemo(() => buildTargetOptions(latestCaption), [latestCaption]);

  useEffect(() => {
    if (uiLanguage) {
      writeStoredValue(uiLanguageStorageKey, uiLanguage);
    }
  }, [uiLanguage]);

  useEffect(() => {
    writeStoredValue(roomStorageKey, roomInput);
  }, [roomInput]);

  useEffect(() => {
    writeStoredValue(targetStorageKey, selectedTarget);
  }, [selectedTarget]);

  useEffect(() => {
    writeStoredValue(fontStorageKey, String(fontIndex));
  }, [fontIndex]);

  useEffect(() => {
    if (targetOptions.includes(selectedTarget)) {
      return;
    }
    const languageDefault = defaultTargetForLanguage(uiLanguage);
    setSelectedTarget(targetOptions.includes(languageDefault) ? languageDefault : targetOptions[0]);
  }, [selectedTarget, targetOptions, uiLanguage]);

  useEffect(() => {
    if (step !== "live") {
      return;
    }

    const socket = createRealtimeConnection(apiBaseUrl);
    socketRef.current = socket;
    setConnectionStatus("connecting");
    setCaptionStream(createCaptionStreamState());

    socket.on("connect", () => {
      socket.emit("join-room", roomId, (presence) => {
        setAudienceCount(presence.audienceCount);
        setConnectionStatus("connected");
      });
    });

    socket.on("disconnect", (reason) => {
      setConnectionStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });

    socket.on("connect_error", () => {
      setConnectionStatus("failed");
    });

    socket.on("room-presence", (presence) => {
      if (presence.roomId === roomId) {
        setAudienceCount(presence.audienceCount);
      }
    });

    socket.on("caption", (caption) => {
      setCaptionStream((current) => reduceCaptionStream(current, caption, captionHistoryLimit));
    });

    socket.connect();

    return () => {
      socket.emit("leave-room", roomId);
      socket.disconnect();
      socketRef.current = null;
      setConnectionStatus("disconnected");
      setAudienceCount(0);
    };
  }, [roomId, step]);

  function handleSelectLanguage(language: UiLanguage) {
    setUiLanguage(language);
    if (!loadStoredValue(targetStorageKey)) {
      setSelectedTarget(defaultTargetForLanguage(language));
    }
    setStep("room");
  }

  function handleRoomInputChange(value: string) {
    setRoomInput(normalizeRoomId(value));
  }

  function handleConnect() {
    setRoomInput(roomId);
    setStep("live");
  }

  function handleLeaveRoom() {
    setStep("room");
    setCaptionStream(createCaptionStreamState());
  }

  function handleIncreaseFont() {
    setFontIndex((current) => clampFontScaleIndex(current + 1));
  }

  function handleDecreaseFont() {
    setFontIndex((current) => clampFontScaleIndex(current - 1));
  }

  function handleChangeLanguage() {
    setStep("language");
  }

  return (
    <main className="audience-app">
      {step === "language" ? (
        <LanguagePicker
          strings={activeStrings}
          selectedLanguage={uiLanguage}
          onSelect={handleSelectLanguage}
        />
      ) : null}

      {step === "room" ? (
        <RoomPicker
          roomInput={roomInput}
          strings={activeStrings}
          onRoomInputChange={handleRoomInputChange}
          onConnect={handleConnect}
          onChangeLanguage={handleChangeLanguage}
        />
      ) : null}

      {step === "live" ? (
        <LiveCaptionsView
          roomId={roomId}
          live={captionStream.live}
          latestCaption={latestCaption}
          history={captionStream.history}
          connectionStatus={connectionStatus}
          audienceCount={audienceCount}
          selectedTarget={selectedTarget}
          targetOptions={targetOptions}
          fontScale={captionFontScales[fontIndex]}
          canDecreaseFont={fontIndex > 0}
          canIncreaseFont={fontIndex < captionFontScales.length - 1}
          strings={activeStrings}
          onSelectedTargetChange={setSelectedTarget}
          onIncreaseFont={handleIncreaseFont}
          onDecreaseFont={handleDecreaseFont}
          onLeaveRoom={handleLeaveRoom}
          onChangeLanguage={handleChangeLanguage}
        />
      ) : null}
    </main>
  );
}

function loadUiLanguage(): UiLanguage | null {
  const stored = loadStoredValue(uiLanguageStorageKey);
  if (stored && uiLanguages.some((language) => language.code === stored)) {
    return stored as UiLanguage;
  }
  return null;
}

function defaultTargetForLanguage(language: UiLanguage | null) {
  return uiLanguages.find((entry) => entry.code === language)?.targetCode ?? "en";
}

function loadFontIndex() {
  const stored = loadStoredValue(fontStorageKey);
  return stored === null ? defaultCaptionFontScaleIndex : clampFontScaleIndex(Number(stored));
}

function loadStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in private browsing modes.
  }
}
