// src/lib/preferences.js
// Preferenze utente client-side (localStorage). Sessione 24.
// Sono "artifact-friendly": niente DB, solo browser locale.
//
// Esporta:
//  - PREFS_KEY        chiave localStorage
//  - DEFAULT_PREFS    valori di default
//  - loadPrefs()      legge dal localStorage (con fallback)
//  - savePrefs(p)     scrive e applica il tema
//  - applyTheme(t)    applica data-theme="dark|light" su <html>
//  - usePreferences() hook React con [prefs, setPrefs]

import { useState, useEffect, useCallback } from "react";

export const PREFS_KEY = "voyagedesk:prefs:v1";

export const DEFAULT_PREFS = {
  theme: "light",        // "light" | "dark" | "system"
  locale: "it",          // "it" | "en"
  dateFormat: "dmy",     // "dmy" | "mdy" | "ymd"
};

export const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const applyTheme = (theme) => {
  if (typeof document === "undefined") return;
  let resolved = theme;
  if (theme === "system") {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    resolved = mq?.matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", resolved);
};

export const savePrefs = (next) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  applyTheme(next.theme);
};

export const usePreferences = () => {
  const [prefs, setPrefsState] = useState(() => loadPrefs());

  useEffect(() => {
    applyTheme(prefs.theme);
  }, [prefs.theme]);

  // Listener "system" → re-apply su cambio OS
  useEffect(() => {
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const h = () => applyTheme("system");
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, [prefs.theme]);

  const setPrefs = useCallback((patch) => {
    setPrefsState(prev => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  return [prefs, setPrefs];
};
