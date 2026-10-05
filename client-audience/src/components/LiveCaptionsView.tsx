import { useEffect, useRef, useState } from "react";
import {
  downloadTranscript,
  formatTranscriptText,
  getSourceLanguageName,
  getTargetLanguageName,
  targetLanguages,
  type CaptionMessage,
  type FinalizedCaption,
} from "@live-translation/shared";
import { ArrowDown, Download, Languages, LogOut, Minus, Monitor, Moon, Plus, Sun } from "lucide-react";
import type { ThemePreference } from "../hooks/useAudiencePreferences";
import type { AudienceStrings, UiLanguage } from "../i18n/strings";
import { AudienceHelp } from "./AudienceHelp";

interface LiveCaptionsViewProps {
  roomId: string;
  uiLanguage: UiLanguage;
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
  theme: ThemePreference;
  strings: AudienceStrings;
  onSelectedTargetChange: (target: string) => void;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onThemeChange: (theme: ThemePreference) => void;
  onLeaveRoom: () => void;
  onChangeLanguage: () => void;
}

export function LiveCaptionsView({
  roomId,
  uiLanguage,
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
  theme,
  strings,
  onSelectedTargetChange,
  onIncreaseFont,
  onDecreaseFont,
  onThemeChange,
  onLeaveRoom,
  onChangeLanguage,
}: LiveCaptionsViewProps) {
  const historyRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [isFollowingLive, setIsFollowingLive] = useState(true);

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
    setIsFollowingLive(stickToBottomRef.current);
  }

  function returnToLive() {
    stickToBottomRef.current = true;
    setIsFollowingLive(true);
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }

  function handleDownloadTranscript() {
    downloadTranscript(formatTranscriptText({
      history,
      live,
      targetLanguage: selectedTarget,
      labels: strings,
    }), roomId, selectedTarget);
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
          <p className="ai-disclaimer">{strings.aiDisclaimer}</p>
          <h1>{roomId}</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-action" type="button" onClick={onChangeLanguage}>
            <Languages aria-hidden="true" size={18} />
            <span>{strings.changeLanguage}</span>
          </button>
          <button className="secondary-action" type="button" onClick={onLeaveRoom}>
            <LogOut aria-hidden="true" size={18} />
            <span>{strings.leaveRoom}</span>
          </button>
        </div>
      </header>

      <div className="status-strip" aria-label={strings.status}>
        <StatusPill label={statusLabel(connectionStatus, strings)} state={connectionStatus} />
        <StatusPill label={strings.connectedViewers(audienceCount)} state={audienceCount > 0 ? "connected" : "disconnected"} />
        <StatusPill
          label={`${strings.speakerLanguage}: ${latestCaption ? getSourceLanguageName(latestCaption.sourceLanguage) : strings.waitingForSpeaker}`}
          state={latestCaption ? "connected" : "reconnecting"}
        />
      </div>

      <div className="caption-toolbar">
        <button
          className="secondary-action download-action"
          type="button"
          onClick={handleDownloadTranscript}
          disabled={history.length === 0 && !live?.originalText && !live?.translations[selectedTarget]}
          title={strings.downloadTranscript}
          aria-label={strings.downloadTranscript}
        >
          <Download aria-hidden="true" size={18} />
        </button>
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
            <Minus aria-hidden="true" size={18} />
          </button>
          <button type="button" onClick={onIncreaseFont} disabled={!canIncreaseFont} aria-label={strings.increaseFont}>
            <Plus aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="viewer-tools">
          <div className="theme-controls" role="group" aria-label={strings.theme}>
            <ThemeButton
              label={strings.systemTheme}
              active={theme === "system"}
              onClick={() => onThemeChange("system")}
            >
              <Monitor aria-hidden="true" size={18} />
            </ThemeButton>
            <ThemeButton
              label={strings.lightTheme}
              active={theme === "light"}
              onClick={() => onThemeChange("light")}
            >
              <Sun aria-hidden="true" size={18} />
            </ThemeButton>
            <ThemeButton
              label={strings.darkTheme}
              active={theme === "dark"}
              onClick={() => onThemeChange("dark")}
            >
              <Moon aria-hidden="true" size={18} />
            </ThemeButton>
          </div>
          <AudienceHelp language={uiLanguage} theme={theme} strings={strings} />
        </div>
      </div>

      <div className="subtitle-card" data-live={live !== null} aria-live="polite" aria-atomic="true">
        {targetMissing ? (
          <p className="subtitle-text">{strings.targetUnavailable(targetName)}</p>
        ) : (
          <p className="subtitle-text">{liveText || strings.waitingForCaptions}</p>
        )}
        {liveSource ? <p className="source-text">{liveSource}</p> : null}
      </div>

      <section className="caption-history" aria-labelledby="history-title">
        <div className="history-heading">
          <h2 id="history-title">{strings.recentCaptions}</h2>
          {!isFollowingLive && history.length > 0 ? (
            <button className="return-live" type="button" onClick={returnToLive}>
              <ArrowDown aria-hidden="true" size={16} />
              <span>{strings.returnToLive}</span>
            </button>
          ) : null}
        </div>
        <div className="history-list" ref={historyRef} onScroll={handleHistoryScroll}>
          {history.map((caption) => {
            const text = caption.translations[selectedTarget];
            if (!text) {
              return null;
            }
            return (
              <article key={caption.id}>
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

function ThemeButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-active={active}
      onClick={onClick}
    >
      {children}
    </button>
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
