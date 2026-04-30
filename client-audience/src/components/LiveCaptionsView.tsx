import { useEffect, useRef } from "react";
import {
  getSourceLanguageName,
  getTargetLanguageName,
  targetLanguages,
  type CaptionMessage,
} from "@live-translation/shared";
import type { AudienceStrings } from "../i18n/strings";

interface LiveCaptionsViewProps {
  roomId: string;
  captions: CaptionMessage[];
  connectionStatus: "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";
  audienceCount: number;
  selectedTarget: string;
  targetOptions: string[];
  strings: AudienceStrings;
  onSelectedTargetChange: (target: string) => void;
  onLeaveRoom: () => void;
  onChangeLanguage: () => void;
}

export function LiveCaptionsView({
  roomId,
  captions,
  connectionStatus,
  audienceCount,
  selectedTarget,
  targetOptions,
  strings,
  onSelectedTargetChange,
  onLeaveRoom,
  onChangeLanguage,
}: LiveCaptionsViewProps) {
  const latestCaption = captions.length > 0 ? captions[captions.length - 1] : undefined;
  const finalCaptions = captions.filter((caption) => caption.isFinal).slice(-10);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [captions, selectedTarget]);

  const latestText = latestCaption?.translations[selectedTarget] ?? "";
  const targetName = getTargetLanguageName(selectedTarget);
  const targetMissing = latestCaption !== undefined && latestCaption.availableTargets.length > 0 && !latestCaption.availableTargets.includes(selectedTarget);

  return (
    <section className="live-shell" aria-label={strings.appName}>
      <header className="live-header">
        <div>
          <p className="eyebrow">{strings.appName}</p>
          <h1>{roomId}</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-action" type="button" onClick={onChangeLanguage}>
            {strings.changeLanguage}
          </button>
          <button className="secondary-action" type="button" onClick={onLeaveRoom}>
            {strings.leaveRoom}
          </button>
        </div>
      </header>

      <div className="status-strip" aria-label="Status">
        <StatusPill label={statusLabel(connectionStatus, strings)} state={connectionStatus} />
        <StatusPill label={strings.connectedViewers(audienceCount)} state={audienceCount > 0 ? "connected" : "disconnected"} />
        <StatusPill
          label={`${strings.speakerLanguage}: ${latestCaption ? getSourceLanguageName(latestCaption.sourceLanguage) : strings.waitingForSpeaker}`}
          state={latestCaption ? "connected" : "reconnecting"}
        />
      </div>

      <label className="target-select">
        <span>{strings.readIn}</span>
        <select value={selectedTarget} onChange={(event) => onSelectedTargetChange(event.target.value)}>
          {targetOptions.map((code) => (
            <option key={code} value={code}>
              {getTargetLanguageName(code)}
            </option>
          ))}
        </select>
      </label>

      <div className="subtitle-card" aria-live="polite" aria-atomic="true">
        {targetMissing ? (
          <p className="subtitle-text">{strings.targetUnavailable(targetName)}</p>
        ) : (
          <p className="subtitle-text">{latestText || strings.waitingForCaptions}</p>
        )}
        {latestCaption?.originalText ? <p className="source-text">{latestCaption.originalText}</p> : null}
      </div>

      <section className="caption-history" aria-labelledby="history-title">
        <h2 id="history-title">{strings.recentCaptions}</h2>
        <div className="history-list" ref={historyRef}>
          {finalCaptions.map((caption) => {
            const text = caption.translations[selectedTarget];
            if (!text) {
              return null;
            }
            return (
              <article key={`${caption.timestamp}-${text}`}>
                <span>{caption.isFinal ? strings.final : strings.live}</span>
                <p>{text}</p>
                {caption.originalText ? <small>{caption.originalText}</small> : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function StatusPill({ label, state }: { label: string; state: string }) {
  return (
    <span className="status-pill" data-state={state}>
      {label}
    </span>
  );
}

function statusLabel(
  status: LiveCaptionsViewProps["connectionStatus"],
  strings: AudienceStrings,
): string {
  if (status === "connected") {
    return strings.connected;
  }
  if (status === "connecting") {
    return strings.connecting;
  }
  if (status === "reconnecting") {
    return strings.reconnecting;
  }
  if (status === "failed") {
    return strings.connectionFailed;
  }
  return strings.disconnected;
}

export function buildTargetOptions(latestCaption: CaptionMessage | undefined) {
  const knownTargets = new Set(targetLanguages.map((language) => language.code));
  if (!latestCaption || latestCaption.availableTargets.length === 0) {
    return targetLanguages.map((language) => language.code);
  }
  return latestCaption.availableTargets.filter((code) => knownTargets.has(code));
}
