/* Copyright (c) 2022~present by tisfeng, maxchang3, All Rights Reserved. */

import type { DictionaryContent } from "@/core/content/types";
import { DictionaryType } from "@/core/results/kinds";
import type { QueryInput, RequestOptions } from "@/core/results/types";
import { BaseDictionaryProvider } from "@/providers/dictionary/base";
import { timedFetch } from "@/shared/http";
import { logTrace } from "@/shared/logger";

import { buildWiktionaryContent } from "./content";
import {
  hasWiktionaryTranslationSubpage,
  parseWiktionaryDefinitions,
  parseWiktionaryTranslations,
  type WiktionaryTranslationGroup,
} from "./parse";
import { getWiktionaryLanguageCodes, getWiktionaryLanguageName, getWiktionaryTitle } from "./url";

/** Wikimedia asks API clients to identify themselves. */
const headers = { "User-Agent": "Raycast-Easydict (https://github.com/tisfeng/Raycast-Easydict)" };

/**
 * Wiktionary dictionary provider, free and keyless.
 *
 * eg. https://en.wiktionary.org/api/rest_v1/page/definition/hus
 */
export class WiktionaryDictionaryProvider extends BaseDictionaryProvider {
  type = DictionaryType.Wiktionary;

  protected override async doQuery(
    queryWordInfo: QueryInput,
    { signal }: RequestOptions = {},
  ): Promise<DictionaryContent> {
    const word = queryWordInfo.word.trim();
    // Wiktionary titles are case-sensitive; sentence-initial capitals are common in selected text.
    const candidates = word === word.toLowerCase() ? [word] : [word, word.toLowerCase()];

    for (const candidate of candidates) {
      const query = { ...queryWordInfo, word: candidate };
      const definitions = parseWiktionaryDefinitions(
        await this.fetchPage(
          `https://en.wiktionary.org/api/rest_v1/page/definition/${getWiktionaryTitle(candidate)}`,
          "json",
          signal,
        ),
        getWiktionaryLanguageName(query.fromLanguage),
      );
      const translations =
        query.fromLanguage === "en" && query.toLanguage !== "en"
          ? await this.fetchTranslations(candidate, getWiktionaryLanguageCodes(query.toLanguage), signal)
          : [];
      const content = buildWiktionaryContent(query, definitions, translations);
      if (content.sections.length) return content;
    }
    return { kind: "dictionary", query: queryWordInfo, sections: [] };
  }

  private async fetchTranslations(
    word: string,
    languageCodes: string[],
    signal?: AbortSignal,
  ): Promise<WiktionaryTranslationGroup[]> {
    const rawURL = (title: string) => `https://en.wiktionary.org/w/index.php?title=${title}&action=raw`;
    const title = getWiktionaryTitle(word);
    const wikitext = await this.fetchPage(rawURL(title), "text", signal);
    if (typeof wikitext !== "string") return [];

    const subpage = hasWiktionaryTranslationSubpage(wikitext)
      ? await this.fetchPage(rawURL(`${title}/translations`), "text", signal)
      : undefined;
    return [
      ...(typeof subpage === "string" ? parseWiktionaryTranslations(subpage, languageCodes) : []),
      ...parseWiktionaryTranslations(wikitext, languageCodes),
    ];
  }

  /** Missing pages are an ordinary "no entry" result, not a request failure. */
  private async fetchPage(url: string, responseType: "json" | "text", signal?: AbortSignal): Promise<unknown> {
    logTrace(this.type, `url: ${url}`);
    const response = await timedFetch.raw(url, { headers, signal, responseType, ignoreResponseError: true });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Wiktionary request failed: ${response.status}`);
    return response._data;
  }
}
