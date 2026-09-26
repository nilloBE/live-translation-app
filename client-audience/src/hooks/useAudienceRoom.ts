import { useEffect, useState } from "react";
import {
  createCaptionStreamState,
  createRealtimeConnection,
  reduceCaptionStream,
  type CaptionStreamState,
} from "@live-translation/shared";

const captionHistoryLimit = 100;

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export function useAudienceRoom(apiBaseUrl: string, roomId: string, isActive: boolean) {
  const [captionStream, setCaptionStream] = useState<CaptionStreamState>(createCaptionStreamState);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [audienceCount, setAudienceCount] = useState(0);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const socket = createRealtimeConnection(apiBaseUrl);
    setConnectionStatus("connecting");
    setCaptionStream(createCaptionStreamState());

    socket.on("connect", () => {
      void socket.timeout(5000).emitWithAck("join-room", roomId).then((presence) => {
        if (!presence.ok) {
          setAudienceCount(0);
          setConnectionStatus('failed');
          return;
        }
        setAudienceCount(presence.audienceCount);
        setConnectionStatus("connected");
      }).catch(() => setConnectionStatus('failed'));
    });
    socket.on("disconnect", (reason) => {
      setConnectionStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });
    socket.on("connect_error", () => setConnectionStatus("failed"));
    socket.on("room-presence", (presence) => {
      if (presence.roomId === roomId) {
        setAudienceCount(presence.audienceCount);
      }
    });
    socket.on("caption", (caption) => {
      if (caption.roomId !== roomId) return;
      setCaptionStream((current) => reduceCaptionStream(current, caption, captionHistoryLimit));
    });
    socket.connect();

    return () => {
      socket.emit("leave-room", roomId);
      socket.disconnect();
      setConnectionStatus("disconnected");
      setAudienceCount(0);
    };
  }, [apiBaseUrl, isActive, roomId]);

  return {
    captionStream,
    connectionStatus,
    audienceCount,
    clearCaptions: () => setCaptionStream(createCaptionStreamState()),
  };
}