/* Copyright (c) 2022~present by tisfeng, maxchang3, All Rights Reserved. */

import { getLanguageEnglishName } from "@/core/language/utils";
import type { QueryInput } from "@/core/results/types";
import { checkIsWord } from "@/providers/shared/utils";

/** Language heading used by English Wiktionary, eg. `Danish`. */
export function getWiktionaryLanguageName(language: string): string {
  const name = getLanguageEnglishName(language);
  return name.startsWith("Chinese") ? "Chinese" : name;
}

/** Codes used in English Wiktionary translation tables, eg. `{{t+|da|hus}}`. */
export function getWiktionaryLanguageCodes(language: string): string[] {
  return language.startsWith("zh") ? ["cmn", "zh"] : [language.split("-")[0]];
}

export function getWiktionaryTitle(word: string): string {
  return encodeURIComponent(word.trim().replace(/ /g, "_"));
}

export function getWiktionaryWebURL(queryWordInfo: QueryInput): string | undefined {
  if (!checkIsWord(queryWordInfo)) return undefined;
  const anchor = getWiktionaryLanguageName(queryWordInfo.fromLanguage).replace(/ /g, "_");
  return `https://en.wiktionary.org/wiki/${getWiktionaryTitle(queryWordInfo.word)}#${anchor}`;
}
