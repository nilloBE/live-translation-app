import { uiLanguages, type AudienceStrings, type UiLanguage } from "../i18n/strings";

interface LanguagePickerProps {
  strings: AudienceStrings;
  selectedLanguage: UiLanguage | null;
  onSelect: (language: UiLanguage) => void;
}

export function LanguagePicker({ strings, selectedLanguage, onSelect }: LanguagePickerProps) {
  return (
    <section className="step-panel" aria-labelledby="language-title">
      <p className="eyebrow">Audience</p>
      <h1 id="language-title">{strings.chooseLanguage}</h1>
      <p className="supporting-text">{strings.chooseLanguageHint}</p>
      <div className="language-grid">
        {uiLanguages.map((language) => (
          <button
            key={language.code}
            type="button"
            className="language-button"
            data-active={language.code === selectedLanguage}
            onClick={() => onSelect(language.code)}
          >
            {language.label}
          </button>
        ))}
      </div>
    </section>
  );
}
