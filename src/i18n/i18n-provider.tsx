import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { messages, type Locale, type MessageKey } from "./messages";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  /** Escolhe o campo `_pt` ou `_en` de um registro multilíngue. */
  pick: (pt?: string | null, en?: string | null) => string;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "app.locale";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("pt");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === "pt" ? "pt-BR" : "en";
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => messages[locale][key] ?? key,
      pick: (pt, en) => (locale === "pt" ? (pt ?? en ?? "") : (en ?? pt ?? "")),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n deve ser usado dentro de <I18nProvider>");
  return ctx;
}
