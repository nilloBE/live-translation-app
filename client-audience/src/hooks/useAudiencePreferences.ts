import { useEffect, useState } from "react";
import {
  captionFontScales,
  clampFontScaleIndex,
  defaultCaptionFontScaleIndex,
} from "@live-translation/shared";
import { uiLanguages, type UiLanguage } from "../i18n/strings";

const uiLanguageStorageKey = "live-translation:audience-ui-lang";
const roomStorageKey = "live-translation:audience-room";
const targetStorageKey = "live-translation:audience-target";
const fontStorageKey = "live-translation:audience-font";
const themeStorageKey = "live-translation:audience-theme";

export type ThemePreference = "system" | "light" | "dark";

export function useAudiencePreferences() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage | null>(loadUiLanguage);
  const [roomInput, setRoomInput] = useState(() => loadStoredValue(roomStorageKey) || "LIVE");
  const [selectedTarget, setSelectedTarget] = useState(
    () => loadStoredValue(targetStorageKey) || defaultTargetForLanguage(loadUiLanguage()),
  );
  const [fontIndex, setFontIndex] = useState(loadFontIndex);
  const [theme, setTheme] = useState<ThemePreference>(loadTheme);

  useEffect(() => {
    if (uiLanguage) {
      writeStoredValue(uiLanguageStorageKey, uiLanguage);
    }
  }, [uiLanguage]);

  useEffect(() => writeStoredValue(roomStorageKey, roomInput), [roomInput]);
  useEffect(() => writeStoredValue(targetStorageKey, selectedTarget), [selectedTarget]);
  useEffect(() => writeStoredValue(fontStorageKey, String(fontIndex)), [fontIndex]);
  useEffect(() => writeStoredValue(themeStorageKey, theme), [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.dataset.theme = theme;
    }
  }, [theme]);

  return {
    uiLanguage,
    setUiLanguage,
    roomInput,
    setRoomInput,
    selectedTarget,
    setSelectedTarget,
    fontIndex,
    fontScale: captionFontScales[fontIndex],
    canDecreaseFont: fontIndex > 0,
    canIncreaseFont: fontIndex < captionFontScales.length - 1,
    increaseFont: () => setFontIndex((current) => clampFontScaleIndex(current + 1)),
    decreaseFont: () => setFontIndex((current) => clampFontScaleIndex(current - 1)),
    theme,
    setTheme,
  };
}

export function defaultTargetForLanguage(language: UiLanguage | null) {
  return uiLanguages.find((entry) => entry.code === language)?.targetCode ?? "en";
}

function loadUiLanguage(): UiLanguage | null {
  const stored = loadStoredValue(uiLanguageStorageKey);
  return stored && uiLanguages.some((language) => language.code === stored)
    ? (stored as UiLanguage)
    : null;
}

function loadFontIndex() {
  const stored = loadStoredValue(fontStorageKey);
  return stored === null ? defaultCaptionFontScaleIndex : clampFontScaleIndex(Number(stored));
}

function loadTheme(): ThemePreference {
  const stored = loadStoredValue(themeStorageKey);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function loadStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in private browsing modes.
  }
}