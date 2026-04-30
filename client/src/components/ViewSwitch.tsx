import { Mic, Users } from "lucide-react";

export type AppView = "speaker" | "audience";

interface ViewSwitchProps {
  activeView: AppView;
  onChange: (view: AppView) => void;
}

export function ViewSwitch({ activeView, onChange }: ViewSwitchProps) {
  return (
    <div className="view-switch" aria-label="Live translation views">
      <button type="button" data-active={activeView === "speaker"} onClick={() => onChange("speaker")}>
        <Mic size={18} aria-hidden="true" />
        Speaker
      </button>
      <button type="button" data-active={activeView === "audience"} onClick={() => onChange("audience")}>
        <Users size={18} aria-hidden="true" />
        Audience
      </button>
    </div>
  );
}