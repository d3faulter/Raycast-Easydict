import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { WiktionaryDictionaryProvider } from ".";
import { parseWiktionaryPronunciation } from "./parse";

const fetchRaw = vi.hoisted(() => vi.fn());
vi.mock("@/shared/http", () => ({ timedFetch: { raw: fetchRaw } }));
vi.mock("@raycast/api", () => ({
  environment: { isDevelopment: false },
  getPreferenceValues: () => ({}),
}));

const fixture = (name: string) => readFileSync(`${__dirname}/fixtures/${name}`, "utf8");

const pages: Record<string, () => unknown> = {
  "rest_v1/page/definition/hus": () => JSON.parse(fixture("definition-hus.json")),
  "rest_v1/page/definition/house": () => JSON.parse(fixture("definition-house.json")),
  "title=hus&action=raw": () => fixture("hus.wikitext"),
  "title=house&action=raw": () => fixture("house.wikitext"),
  "title=house/translations&action=raw": () => fixture("house-translations.wikitext"),
  "page=hus&prop=text&section=29&": () => JSON.parse(fixture("parse-hus.json")),
  "page=house&prop=text&section=1&": () => JSON.parse(fixture("parse-house.json")),
};

beforeEach(() => {
  fetchRaw.mockReset();
  fetchRaw.mockImplementation(async (url: string) => {
    const page = Object.entries(pages).find(([path]) => url.endsWith(path) || url.includes(`${path}format`))?.[1];
    return page ? { status: 200, ok: true, _data: page() } : { status: 404, ok: false, _data: undefined };
  });
});

describe("Wiktionary dictionary", () => {
  it("shows English glosses, pronunciation, and word forms for a Danish word", async () => {
    const result = await new WiktionaryDictionaryProvider().request({
      word: "hus",
      fromLanguage: "da",
      toLanguage: "en",
    });
    const sections = result.content.sections;

    expect(result.content.query).toMatchObject({ word: "hus", isWord: true, phonetic: "[ˈhuˀs]" });
    expect(sections[0]).toEqual({
      kind: "translation",
      text: "house; building; block of flats, cottage",
      lemma: "hus",
    });
    expect(sections[1]).toEqual({
      kind: "form-set",
      forms: [
        { label: "noun", value: "hus" },
        { label: "gender", value: "neuter" },
        { label: "singular definite", value: "huset" },
        { label: "plural indefinite", value: "huse" },
      ],
    });
    expect(sections[2]).toMatchObject({
      kind: "equivalents",
      headword: { word: "hus", partOfSpeech: "noun" },
      entries: [
        { text: "house", partOfSpeech: "n." },
        { text: "building", partOfSpeech: "n." },
        { text: "block of flats, cottage", partOfSpeech: "n." },
        { text: "shell", partOfSpeech: "n." },
      ],
    });
    expect(sections).toContainEqual(expect.objectContaining({ headword: { word: "hus", partOfSpeech: "verb" } }));
  });

  it("shows Danish translations, forms, and examples for an English word", async () => {
    const result = await new WiktionaryDictionaryProvider().request({
      word: "house",
      fromLanguage: "en",
      toLanguage: "da",
    });
    const sections = result.content.sections;

    expect(result.content.query.phonetic).toBe("/haʊ̯s/");
    expect(sections[0]).toMatchObject({ kind: "translation", text: "hus" });
    expect(sections[1]).toMatchObject({
      kind: "form-set",
      forms: [
        { label: "noun", value: "house" },
        { label: "plural", value: "houses" },
      ],
    });
    expect(sections).toContainEqual({
      kind: "equivalents",
      headword: { word: "house", qualifier: "(human abode)", partOfSpeech: "noun" },
      entries: [{ text: "hus", partOfSpeech: "n.", prominent: true, frequency: "common" }],
    });
    expect(sections).toContainEqual(
      expect.objectContaining({
        headword: expect.objectContaining({
          qualifier: "(keep within a structure or container)",
          partOfSpeech: "verb",
        }),
        entries: [expect.objectContaining({ text: "indhuse", partOfSpeech: "v." })],
      }),
    );
    expect(sections).toContainEqual(
      expect.objectContaining({
        kind: "examples",
        entries: expect.arrayContaining([
          { sentence: "This is my house and my family's ancestral home.", partOfSpeech: "n" },
        ]),
      }),
    );
    expect(sections.at(-1)).toMatchObject({ kind: "definitions" });
  });

  it("uses the Commons MP3 transcode of the first recording for the source language", () => {
    const wikitext =
      "==English==\n{{audio|en|en-us-cat.ogg}}\n==Danish==\n* {{IPA|da|[kʰæd]}}\n* {{audio|da|Da-kat.ogg}}\n";

    expect(parseWiktionaryPronunciation(wikitext, "Danish", ["da"])).toEqual({
      ipa: "[kʰæd]",
      audioUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/35/Da-kat.ogg/Da-kat.ogg.mp3",
    });
  });

  it("retries a capitalized word in lowercase", async () => {
    const result = await new WiktionaryDictionaryProvider().request({
      word: "Hus",
      fromLanguage: "da",
      toLanguage: "en",
    });

    expect(result.content.query.word).toBe("hus");
    expect(result.content.sections.length).toBeGreaterThan(0);
  });

  it("returns no sections for a missing page instead of failing", async () => {
    const result = await new WiktionaryDictionaryProvider().request({
      word: "qwzxv",
      fromLanguage: "da",
      toLanguage: "en",
    });

    expect(result.content.sections).toEqual([]);
  });

  it("reports server errors as request failures", async () => {
    fetchRaw.mockResolvedValue({ status: 503, ok: false, _data: undefined });

    await expect(
      new WiktionaryDictionaryProvider().request({ word: "hus", fromLanguage: "da", toLanguage: "en" }),
    ).rejects.toThrow("503");
  });
});
