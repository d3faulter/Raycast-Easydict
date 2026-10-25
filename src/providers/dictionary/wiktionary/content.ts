/* Copyright (c) 2022~present by tisfeng, maxchang3, All Rights Reserved. */

import type { ContentEquivalent, DictionaryContent, DictionarySection } from "@/core/content/types";
import type { QueryInput } from "@/core/results/types";

import type { WiktionaryDefinitionEntry, WiktionaryTranslationGroup } from "./parse";

const maxGroups = 8;
const maxGlosses = 6;

function equivalents(texts: string[]): ContentEquivalent[] {
  return texts.map((text) => ({ text, prominent: true, frequency: "common" }));
}

/**
 * Translation tables are preferred when looking up an English word in another language;
 * otherwise the source-language definitions, whose glosses are written in English, are shown.
 */
export function buildWiktionaryContent(
  query: QueryInput,
  definitions: WiktionaryDefinitionEntry[],
  translations: WiktionaryTranslationGroup[],
): DictionaryContent {
  const sections: DictionarySection[] = [];

  if (translations.length) {
    const primary = translations[0].words.slice(0, 3).join(", ");
    sections.push({ kind: "translation", text: primary, lemma: query.word });
    for (const { gloss, partOfSpeech, words } of translations.slice(0, maxGroups)) {
      sections.push({
        kind: "equivalents",
        headword: {
          word: query.word,
          qualifier: gloss ? `(${gloss})` : undefined,
          partOfSpeech: partOfSpeech?.toLowerCase(),
        },
        entries: equivalents(words),
      });
    }
    const glosses = definitions.flatMap(({ partOfSpeech, glosses }) =>
      glosses.map((text) => ({ kind: "plain" as const, text, note: partOfSpeech.toLowerCase() })),
    );
    if (glosses.length) sections.push({ kind: "definitions", entries: glosses.slice(0, 5) });
  } else if (definitions.length) {
    sections.push({ kind: "translation", text: definitions[0].glosses.slice(0, 3).join("; "), lemma: query.word });
    for (const { partOfSpeech, glosses } of definitions.slice(0, maxGroups)) {
      sections.push({
        kind: "equivalents",
        headword: { word: query.word, partOfSpeech: partOfSpeech.toLowerCase() },
        entries: equivalents(glosses.slice(0, maxGlosses)),
      });
    }
  }

  return { kind: "dictionary", query: { ...query, isWord: sections.length > 0 || query.isWord }, sections };
}
