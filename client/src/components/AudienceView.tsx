import { Captions, Eraser } from "lucide-react";
import { useEffect, useRef } from "react";
import { StatusBadge } from "./StatusBadge";
import type { CaptionMessage } from "../services/realtime";

interface AudienceViewProps {
  captions: CaptionMessage[];
  audienceStatus: string;
  audienceCount: number;
  onClear: () => void;
}

export function AudienceView({ captions, audienceStatus, audienceCount, onClear }: AudienceViewProps) {
  const latestCaption = captions.length > 0 ? captions[captions.length - 1] : undefined;
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [captions]);

  return (
    <section className="audience-stage" aria-label="Audience captions">
      <div className="status-grid audience-status">
        <StatusBadge
          icon={Captions}
          label={audienceStatus}
          state={audienceStatus.startsWith("Joined") ? "active" : "idle"}
        />
        <StatusBadge icon={Captions} label={`${audienceCount} connected`} state={audienceCount > 0 ? "active" : "idle"} />
        <button className="secondary-action compact-action" type="button" onClick={onClear}>
          <Eraser size={18} aria-hidden="true" />
          Clear
        </button>
      </div>

      <div className="subtitle-card" aria-live="polite" aria-atomic="true">
        <p className="subtitle-text">{latestCaption?.translatedText || "Waiting for live captions"}</p>
        {latestCaption?.originalText ? <p className="source-text">{latestCaption.originalText}</p> : null}
      </div>

      <div className="caption-history" ref={historyRef} aria-label="Recent captions">
        {captions.map((caption) => (
          <article key={`${caption.timestamp}-${caption.translatedText}`}>
            <span>{caption.isFinal ? "Final" : "Live"}</span>
            <p>{caption.translatedText}</p>
            {caption.originalText ? <small>{caption.originalText}</small> : null}
          </article>
        ))}
      </div>
    </section>
  );
}