import { Captions, Eraser } from "lucide-react";
import { useEffect, useRef } from "react";
import { StatusBadge } from "./StatusBadge";
import type { CaptionMessage } from "../services/realtime";
import { getTargetLanguageName } from "../services/speechTranslation";

interface AudienceViewProps {
  captions: CaptionMessage[];
  audienceStatus: string;
  audienceCount: number;
  selectedTarget: string;
  onClear: () => void;
}

export function AudienceView({
  captions,
  audienceStatus,
  audienceCount,
  selectedTarget,
  onClear,
}: AudienceViewProps) {
  const latestCaption = captions.length > 0 ? captions[captions.length - 1] : undefined;
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [captions, selectedTarget]);

  const latestText = latestCaption ? latestCaption.translations[selectedTarget] : "";
  const latestAvailable = latestCaption?.availableTargets ?? [];
  const targetMissing =
    latestCaption !== undefined &&
    latestAvailable.length > 0 &&
    !latestAvailable.includes(selectedTarget);

  return (
    <section className="audience-stage" aria-label="Audience captions">
      <div className="status-grid audience-status">
        <StatusBadge
          icon={Captions}
          label={audienceStatus}
          state={audienceStatus.startsWith("Joined") ? "active" : "idle"}
        />
        <StatusBadge icon={Captions} label={`${audienceCount} connected`} state={audienceCount > 0 ? "active" : "idle"} />
        <StatusBadge
          icon={Captions}
          label={`Reading ${getTargetLanguageName(selectedTarget)}`}
          state="active"
        />
        <button className="secondary-action compact-action" type="button" onClick={onClear}>
          <Eraser size={18} aria-hidden="true" />
          Clear
        </button>
      </div>

      <div className="subtitle-card" aria-live="polite" aria-atomic="true">
        {targetMissing ? (
          <p className="subtitle-text">
            The speaker is not broadcasting {getTargetLanguageName(selectedTarget)} right now.
          </p>
        ) : (
          <p className="subtitle-text">{latestText || "Waiting for live captions"}</p>
        )}
        {latestCaption?.originalText ? <p className="source-text">{latestCaption.originalText}</p> : null}
      </div>

      <div className="caption-history" ref={historyRef} aria-label="Recent captions">
        {captions.map((caption) => {
          const text = caption.translations[selectedTarget];
          if (!text) {
            return null;
          }
          return (
            <article key={`${caption.timestamp}-${text}`}>
              <span>{caption.isFinal ? "Final" : "Live"}</span>
              <p>{text}</p>
              {caption.originalText ? <small>{caption.originalText}</small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
