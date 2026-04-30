import { useEffect, useMemo, useRef, useState } from "react";
import {
  createRealtimeConnection,
  normalizeRoomId,
  type CaptionMessage,
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

type AudienceStep = "language" | "room" | "live";
type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";

export function App() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage | null>(() => loadUiLanguage());
  const [step, setStep] = useState<AudienceStep>(() => (loadUiLanguage() ? "room" : "language"));
  const [roomInput, setRoomInput] = useState(() => loadStoredValue(roomStorageKey) || "LIVE");
  const [captions, setCaptions] = useState<CaptionMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [audienceCount, setAudienceCount] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState(() => loadStoredValue(targetStorageKey) || defaultTargetForLanguage(loadUiLanguage()));
  const socketRef = useRef<RealtimeConnection | null>(null);

  const activeStrings = strings[uiLanguage ?? "en"];
  const roomId = useMemo(() => normalizeRoomId(roomInput), [roomInput]);
  const latestCaption = captions.length > 0 ? captions[captions.length - 1] : undefined;
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
    setCaptions([]);

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
      setCaptions((currentCaptions) => [...currentCaptions, caption].slice(-20));
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
    setCaptions([]);
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
          captions={captions}
          connectionStatus={connectionStatus}
          audienceCount={audienceCount}
          selectedTarget={selectedTarget}
          targetOptions={targetOptions}
          strings={activeStrings}
          onSelectedTargetChange={setSelectedTarget}
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
