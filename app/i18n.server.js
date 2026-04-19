import fs from "fs/promises";
import path from "path";

const DEFAULT_LOCALE = "en";

async function readLocaleFile(locale) {
  const localeFile = path.join(process.cwd(), "app", "locales", `${locale}.json`);
  try {
    const content = await fs.readFile(localeFile, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function mergeMessages(base = {}, override = {}) {
  const result = { ...base };
  Object.keys(override).forEach((key) => {
    const baseVal = result[key];
    const overrideVal = override[key];
    if (
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal) &&
      overrideVal &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = mergeMessages(baseVal, overrideVal);
    } else {
      result[key] = overrideVal;
    }
  });
  return result;
}

export async function getMessages(locale) {
  const normalized = (locale || DEFAULT_LOCALE).toLowerCase();
  const fallbackMessages = await readLocaleFile(DEFAULT_LOCALE);
  const localeMessages =
    normalized === DEFAULT_LOCALE ? fallbackMessages : await readLocaleFile(normalized);

  const messages = mergeMessages(fallbackMessages || {}, localeMessages || {});
  return {
    locale: normalized,
    messages,
  };
}
