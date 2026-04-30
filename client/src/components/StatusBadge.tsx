import type { LucideIcon } from "lucide-react";

interface StatusBadgeProps {
  icon: LucideIcon;
  label: string;
  state?: "active" | "idle" | "warning";
}

export function StatusBadge({ icon: Icon, label, state = "idle" }: StatusBadgeProps) {
  return (
    <span className="status-pill" data-state={state}>
      <Icon size={16} aria-hidden="true" />
      {label}
    </span>
  );
}