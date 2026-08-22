import { useEffect, useRef } from "react";
import {
  getSourceLanguageName,
  getTargetLanguageName,
  targetLanguages,
  type CaptionMessage,
  type FinalizedCaption,
} from "@live-translation/shared";
import type { AudienceStrings } from "../i18n/strings";

interface LiveCaptionsViewProps {
  roomId: string;
  live: CaptionMessage | null;
  latestCaption: CaptionMessage | undefined;
  history: FinalizedCaption[];
  connectionStatus: "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";
  audienceCount: number;
  selectedTarget: string;
  targetOptions: string[];
  fontScale: number;
  canDecreaseFont: boolean;
  canIncreaseFont: boolean;
  strings: AudienceStrings;
  onSelectedTargetChange: (target: string) => void;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onLeaveRoom: () => void;
  onChangeLanguage: () => void;
}

export function LiveCaptionsView({
  roomId,
  live,
  latestCaption,
  history,
  connectionStatus,
  audienceCount,
  selectedTarget,
  targetOptions,
  fontScale,
  canDecreaseFont,
  canIncreaseFont,
  strings,
  onSelectedTargetChange,
  onIncreaseFont,
  onDecreaseFont,
  onLeaveRoom,
  onChangeLanguage,
}: LiveCaptionsViewProps) {
  const historyRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const lastFinal = history.length > 0 ? history[history.length - 1] : undefined;
  const liveText = live?.translations[selectedTarget] ?? lastFinal?.translations[selectedTarget] ?? "";
  const liveSource = live?.originalText ?? lastFinal?.originalText ?? "";
  const targetName = getTargetLanguageName(selectedTarget);
  const targetMissing =
    latestCaption !== undefined &&
    latestCaption.availableTargets.length > 0 &&
    !latestCaption.availableTargets.includes(selectedTarget);

  useEffect(() => {
    if (stickToBottomRef.current) {
      historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [history, selectedTarget]);

  function handleHistoryScroll() {
    const element = historyRef.current;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 48;
  }

  return (
    <section
      className="live-shell"
      aria-label={strings.appName}
      style={{ "--caption-scale": fontScale } as React.CSSProperties}
    >
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

      <div className="caption-toolbar">
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

        <div className="font-controls" role="group" aria-label={strings.fontSize}>
          <span aria-hidden="true">{strings.fontSize}</span>
          <button type="button" onClick={onDecreaseFont} disabled={!canDecreaseFont} aria-label={strings.decreaseFont}>
            A-
          </button>
          <button type="button" onClick={onIncreaseFont} disabled={!canIncreaseFont} aria-label={strings.increaseFont}>
            A+
          </button>
        </div>
      </div>

      <div className="subtitle-card" data-live={live !== null} aria-live="polite" aria-atomic="true">
        {targetMissing ? (
          <p className="subtitle-text">{strings.targetUnavailable(targetName)}</p>
        ) : (
          <p className="subtitle-text" key={liveText}>
            {liveText || strings.waitingForCaptions}
          </p>
        )}
        {liveSource ? <p className="source-text">{liveSource}</p> : null}
      </div>

      <section className="caption-history" aria-labelledby="history-title">
        <h2 id="history-title">{strings.recentCaptions}</h2>
        <div className="history-list" ref={historyRef} onScroll={handleHistoryScroll}>
          {history.map((caption) => {
            const text = caption.translations[selectedTarget];
            if (!text) {
              return null;
            }
            return (
              <article key={caption.id}>
                <span>{strings.final}</span>
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
