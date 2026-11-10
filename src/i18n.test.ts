import { describe, expect, it } from "vitest";
import { translate, type Locale, type MessageKey } from "./i18n";
import source from "./i18n.ts?raw";

// Extract each locale's key set straight from the source so the test also
// catches keys that only fall back to English at runtime.

function keysFor(locale: Locale): Set<string> {
  const start = source.indexOf(`  ${locale}: {`);
  expect(start).toBeGreaterThan(-1);
  const others = (["en", "hi", "mr"] as Locale[])
    .map((l) => source.indexOf(`  ${l}: {`, start + 5))
    .filter((i) => i > 0);
  const end = others.length ? Math.min(...others) : source.indexOf("} satisfies");
  const body = source.slice(start, end);
  return new Set([...body.matchAll(/\b([A-Za-z0-9]+)\s*:\s*"/g)].map((m) => m[1]).filter((k) => k !== locale));
}

describe("translations", () => {
  const en = keysFor("en");

  it("has the same keys in Hindi and Marathi as in English", () => {
    for (const locale of ["hi", "mr"] as Locale[]) {
      const keys = keysFor(locale);
      expect([...en].filter((k) => !keys.has(k)), `${locale} is missing keys`).toEqual([]);
      expect([...keys].filter((k) => !en.has(k)), `${locale} has unknown keys`).toEqual([]);
    }
  });

  it("never returns an empty string, and non-English text differs from English", () => {
    const untranslatedAllowed = new Set(["unitPcs"]);
    for (const key of en) {
      for (const locale of ["en", "hi", "mr"] as Locale[]) {
        expect(translate(locale, key as MessageKey).trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
      if (!untranslatedAllowed.has(key)) {
        // A Hindi/Marathi string identical to English is almost always a copy-paste gap.
        const english = translate("en", key as MessageKey);
        const hasLetters = /[A-Za-z]{4,}/.test(english);
        if (hasLetters && !/AES|PIN|UPI|GST|SKU|INR/.test(english)) {
          expect(translate("hi", key as MessageKey), `hi.${key} equals English`).not.toBe(english);
          expect(translate("mr", key as MessageKey), `mr.${key} equals English`).not.toBe(english);
        }
      }
    }
  });
});
