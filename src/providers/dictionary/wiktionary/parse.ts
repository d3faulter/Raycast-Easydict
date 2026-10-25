/* Copyright (c) 2022~present by tisfeng, maxchang3, All Rights Reserved. */

export interface WiktionaryDefinitionEntry {
  partOfSpeech: string;
  glosses: string[];
}

export interface WiktionaryTranslationGroup {
  partOfSpeech?: string;
  gloss: string;
  words: string[];
}

const htmlEntities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X"))
        return String.fromCodePoint(parseInt(entity.slice(2), 16));
      if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
      return htmlEntities[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the Wiktionary REST `page/definition` payload for one language.
 *
 * eg. https://en.wiktionary.org/api/rest_v1/page/definition/hus
 */
export function parseWiktionaryDefinitions(payload: unknown, languageName: string): WiktionaryDefinitionEntry[] {
  if (!isRecord(payload)) return [];
  const entries: WiktionaryDefinitionEntry[] = [];
  for (const languageEntries of Object.values(payload)) {
    if (!Array.isArray(languageEntries)) continue;
    for (const entry of languageEntries) {
      if (!isRecord(entry) || entry.language !== languageName || !Array.isArray(entry.definitions)) continue;
      const glosses = entry.definitions
        .map((definition) =>
          isRecord(definition) && typeof definition.definition === "string" ? htmlToText(definition.definition) : "",
        )
        .filter(Boolean);
      if (glosses.length) {
        entries.push({ partOfSpeech: typeof entry.partOfSpeech === "string" ? entry.partOfSpeech : "", glosses });
      }
    }
  }
  return entries;
}

/** Positional template arguments, without named ones such as `id=` or `tr=`. */
function templateArguments(template: string): string[] {
  return template.split("|").filter((argument) => !/^\s*[\w-]+\s*=/.test(argument));
}

function cleanWikiText(text: string): string {
  return text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .trim();
}

const partsOfSpeech = new Set([
  "Noun",
  "Proper noun",
  "Verb",
  "Adjective",
  "Adverb",
  "Pronoun",
  "Preposition",
  "Conjunction",
  "Interjection",
  "Determiner",
  "Article",
  "Numeral",
  "Particle",
  "Phrase",
  "Prepositional phrase",
  "Idiom",
  "Proverb",
  "Prefix",
  "Suffix",
]);

export function hasWiktionaryTranslationSubpage(wikitext: string): boolean {
  return wikitext.includes("{{see translation subpage");
}

/**
 * Parse translation tables (`{{trans-top|gloss}} ... {{t|da|word}} ... {{trans-bottom}}`)
 * from the English section of an English Wiktionary page.
 *
 * @param languageCodes Wiktionary language codes of the target language, eg. `["da"]`.
 */
export function parseWiktionaryTranslations(wikitext: string, languageCodes: string[]): WiktionaryTranslationGroup[] {
  const englishSection = wikitext.split(/^==English==\s*$/m)[1]?.split(/^==[^=].*==\s*$/m)[0] ?? "";
  const groups: WiktionaryTranslationGroup[] = [];
  let partOfSpeech: string | undefined;
  let current: WiktionaryTranslationGroup | undefined;

  for (const line of englishSection.split("\n")) {
    const heading = line.match(/^={3,}\s*([^=]+?)\s*={3,}\s*$/);
    if (heading) {
      if (partsOfSpeech.has(heading[1])) partOfSpeech = heading[1];
      continue;
    }

    const top = line.match(/\{\{trans-top(?:-see)?\|([^}]*)\}\}/);
    if (top) {
      current = { partOfSpeech, gloss: cleanWikiText(templateArguments(top[1])[0] ?? ""), words: [] };
      continue;
    }
    if (/\{\{trans-bottom\}\}/.test(line)) {
      if (current?.words.length) groups.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;

    for (const [, body] of line.matchAll(/\{\{tt?\+?\|([^}]*)\}\}/g)) {
      const [code, word] = templateArguments(body);
      if (code && word && languageCodes.includes(code.trim())) {
        const text = cleanWikiText(word);
        if (text && !current.words.includes(text)) current.words.push(text);
      }
    }
  }
  return groups;
}
