/* Copyright (c) 2022~present by tisfeng, maxchang3, All Rights Reserved. */

import type { ContentEquivalent, DictionaryContent, DictionarySection } from "@/core/content/types";
import type { QueryInput } from "@/core/results/types";

import type {
  WiktionaryDefinitionEntry,
  WiktionaryHeadwordForms,
  WiktionaryPronunciation,
  WiktionaryTranslationGroup,
} from "./parse";

const maxGroups = 8;
const maxGlosses = 6;
const maxExamples = 3;

export interface WiktionaryLookup {
  definitions: WiktionaryDefinitionEntry[];
  translations: WiktionaryTranslationGroup[];
  pronunciation: WiktionaryPronunciation;
  forms: WiktionaryHeadwordForms[];
}

const partOfSpeechAbbreviations: Record<string, string> = {
  noun: "n.",
  "proper noun": "prop. n.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
  pronoun: "pron.",
  preposition: "prep.",
  conjunction: "conj.",
  interjection: "interj.",
  determiner: "det.",
  article: "art.",
  numeral: "num.",
  particle: "part.",
  phrase: "phr.",
};

function abbreviate(partOfSpeech = ""): string | undefined {
  const name = partOfSpeech.toLowerCase();
  return partOfSpeechAbbreviations[name] ?? (name || undefined);
}

function equivalents(texts: string[], partOfSpeech?: string): ContentEquivalent[] {
  const abbreviation = abbreviate(partOfSpeech);
  return texts.map((text) => ({ text, partOfSpeech: abbreviation, prominent: true, frequency: "common" }));
}

/**
 * Translation tables are preferred when looking up an English word in another language;
 * otherwise the source-language definitions, whose glosses are written in English, are shown.
 */
export function buildWiktionaryContent(
  query: QueryInput,
  { definitions, translations, pronunciation, forms }: WiktionaryLookup,
): DictionaryContent {
  const sections: DictionarySection[] = [];

  if (translations.length) {
    const primary = translations[0].words.slice(0, 3).join(", ");
    sections.push({ kind: "translation", text: primary, lemma: query.word });
  } else if (definitions.length) {
    sections.push({ kind: "translation", text: definitions[0].glosses.slice(0, 3).join("; "), lemma: query.word });
  }
  if (!sections.length) return { kind: "dictionary", query, sections };

  for (const { partOfSpeech, forms: headwordForms } of forms) {
    sections.push({
      kind: "form-set",
      forms: [{ label: partOfSpeech.toLowerCase(), value: query.word }, ...headwordForms],
    });
  }

  if (translations.length) {
    for (const { gloss, partOfSpeech, words } of translations.slice(0, maxGroups)) {
      sections.push({
        kind: "equivalents",
        headword: {
          word: query.word,
          qualifier: gloss ? `(${gloss})` : undefined,
          partOfSpeech: partOfSpeech?.toLowerCase(),
        },
        entries: equivalents(words, partOfSpeech),
      });
    }
  } else {
    for (const { partOfSpeech, glosses } of definitions.slice(0, maxGroups)) {
      sections.push({
        kind: "equivalents",
        headword: { word: query.word, partOfSpeech: partOfSpeech.toLowerCase() },
        entries: equivalents(glosses.slice(0, maxGlosses), partOfSpeech),
      });
    }
  }

  const examples = definitions.flatMap(({ partOfSpeech, examples }) =>
    examples.map((example) => ({ ...example, partOfSpeech: abbreviate(partOfSpeech)?.replace(/\.$/, "") })),
  );
  if (examples.length) sections.push({ kind: "examples", entries: examples.slice(0, maxExamples) });

  if (translations.length) {
    const glosses = definitions.flatMap(({ partOfSpeech, glosses }) =>
      glosses.map((text) => ({ kind: "plain" as const, text, note: abbreviate(partOfSpeech) })),
    );
    if (glosses.length) sections.push({ kind: "definitions", entries: glosses.slice(0, 5) });
  }

  return {
    kind: "dictionary",
    query: { ...query, isWord: true, phonetic: pronunciation.ipa, speechUrl: pronunciation.audioUrl },
    sections,
  };
}
