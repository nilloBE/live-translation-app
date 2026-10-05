import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import type { ThemePreference } from "../hooks/useAudiencePreferences";
import type { AudienceStrings, UiLanguage } from "../i18n/strings";

interface AudienceHelpProps {
  language: UiLanguage;
  theme: ThemePreference;
  strings: AudienceStrings;
  showLabel?: boolean;
}

export function AudienceHelp({ language, theme, strings, showLabel = false }: AudienceHelpProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const params = new URLSearchParams({ lang: language });
  if (theme !== "system") {
    params.set("scoutTheme", theme);
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.origin === window.location.origin &&
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === "audience-help-close"
      ) {
        dialogRef.current?.close();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function openHelp() {
    setIsOpen(true);
    dialogRef.current?.showModal();
  }

  function handleClose() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        className={`secondary-action help-trigger${showLabel ? " help-with-label" : ""}`}
        type="button"
        title={strings.help}
        aria-label={strings.help}
        aria-haspopup="dialog"
        onClick={openHelp}
      >
        <CircleHelp aria-hidden="true" size={20} />
        {showLabel ? <span>{strings.help}</span> : null}
      </button>
      <dialog ref={dialogRef} className="help-dialog" aria-labelledby={titleId} onClose={handleClose}>
        <header className="help-dialog-header">
          <h2 id={titleId}>{strings.help}</h2>
          <button
            className="secondary-action help-trigger"
            type="button"
            title={strings.closeHelp}
            aria-label={strings.closeHelp}
            onClick={() => dialogRef.current?.close()}
            autoFocus
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        {isOpen ? (
          <iframe
            ref={frameRef}
            title={`${strings.help} - Live Translation`}
            src={`${import.meta.env.BASE_URL}help.html?${params}`}
          />
        ) : null}
      </dialog>
    </>
  );
}