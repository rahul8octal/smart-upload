import { createContext, useContext, useMemo } from "react";

const I18nContext = createContext({
  locale: "en",
  t: (key, defaultText) => defaultText || key,
});

function getNestedValue(key, messages) {
  if (!key || !messages) return null;
  return key.split(".").reduce((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return acc[part];
    }
    return null;
  }, messages);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/{{(.*?)}}/g, (_, p1) => {
    const trimmed = (p1 || "").trim();
    return Object.prototype.hasOwnProperty.call(vars, trimmed) ? vars[trimmed] : "";
  });
}

export function I18nProvider({ locale = "en", messages = {}, children }) {
  const value = useMemo(() => {
    const t = (key, defaultText, vars) => {
      const val = getNestedValue(key, messages);
      if (typeof val === "string") {
        return vars ? interpolate(val, vars) : val;
      }
      return vars ? interpolate(defaultText || key, vars) : (defaultText || key);
    };
    return { locale: locale || "en", t };
  }, [locale, messages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
