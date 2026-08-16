import { createContext, useContext, useEffect, useMemo } from "react";

import { messages, type Locale, type MessageKey } from "./messages";

interface I18nValue {
  locale: Locale;
  /** Mantido por compatibilidade: a aplicação é somente em inglês (EUA). */
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  /** Escolhe o texto em inglês, com fallback para o valor legado cadastrado. */
  pick: (pt?: string | null, en?: string | null) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = "en-US";
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale: "en",
      setLocale: () => {},
      t: (key) => messages.en[key] ?? key,
      pick: (pt, en) => en ?? pt ?? "",
    }),
    [],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
