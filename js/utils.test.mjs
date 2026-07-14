import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, safeHttpsUrl, hiraganaToKatakana, searchByName, searchPokemon } from "./utils.js";

test("escapeHtml: HTML特殊文字をエスケープする", () => {
  assert.equal(escapeHtml(`<script>"a" & 'b'</script>`), "&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;");
});

test("escapeHtml: null/undefinedは空文字扱い", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("safeHttpsUrl: https URLはそのまま返す", () => {
  assert.equal(safeHttpsUrl("https://example.com/a"), "https://example.com/a");
});

test("safeHttpsUrl: javascript:等の非httpsはnullを返す", () => {
  assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpsUrl("data:text/html,<script>1</script>"), null);
});

test("safeHttpsUrl: 不正な値はnullを返す", () => {
  assert.equal(safeHttpsUrl("not a url"), null);
});

test("hiraganaToKatakana: ひらがなをカタカナに変換する", () => {
  assert.equal(hiraganaToKatakana("ぴかちゅう"), "ピカチュウ");
});

test("hiraganaToKatakana: カタカナ・英数字はそのまま", () => {
  assert.equal(hiraganaToKatakana("ピカチュウpika123"), "ピカチュウpika123");
});

test("hiraganaToKatakana: null/undefinedは空文字扱い", () => {
  assert.equal(hiraganaToKatakana(null), "");
  assert.equal(hiraganaToKatakana(undefined), "");
});

const pokemons = [
  { id: "pikachu", name: "ピカチュウ" },
  { id: "raichu", name: "ライチュウ" },
  { id: "pichu", name: "ピチュー" },
];

test("searchByName: ひらがな入力をカタカナに正規化してヒットする", () => {
  const result = searchByName(pokemons, "ぴか", (p) => p.name);
  assert.deepEqual(result.map((p) => p.id), ["pikachu"]);
});

test("searchByName: 前方一致を部分一致より先頭にする", () => {
  const result = searchByName(pokemons, "チュウ", (p) => p.name);
  // 前方一致なし、部分一致のみ: pikachu, raichu の順(元の並び順を保持)
  assert.deepEqual(result.map((p) => p.id), ["pikachu", "raichu"]);
});

test("searchByName: 前方一致するものが部分一致より前に来る", () => {
  const items = [
    { id: "a", name: "ライチュウ" }, // 部分一致のみ("チュウ"を含む)
    { id: "b", name: "チュウチュウ" }, // 前方一致("チュウ"で始まる)
  ];
  const result = searchByName(items, "チュウ", (i) => i.name);
  assert.deepEqual(result.map((i) => i.id), ["b", "a"]);
});

test("searchByName: queryが空文字なら空配列を返す", () => {
  assert.deepEqual(searchByName(pokemons, "", (p) => p.name), []);
});

test("searchByName: 該当なしなら空配列を返す", () => {
  assert.deepEqual(searchByName(pokemons, "存在しない", (p) => p.name), []);
});

const pokedexEntries = [
  { id: "pikachu", name: "Pikachu", nameJa: "ピカチュウ", num: 25 },
  { id: "raichu", name: "Raichu", nameJa: "ライチュウ", num: 26 },
  { id: "pichu", name: "Pichu", nameJa: "ピチュー", num: 172 },
  { id: "charizard", name: "Charizard", nameJa: "リザードン", num: 6 },
];

test("searchPokemon: 日本語名のひらがな入力でヒットする", () => {
  const result = searchPokemon(pokedexEntries, "ぴか");
  assert.deepEqual(result.map((p) => p.id), ["pikachu"]);
});

test("searchPokemon: 日本語名のカタカナ入力でヒットする", () => {
  const result = searchPokemon(pokedexEntries, "ピカ");
  assert.deepEqual(result.map((p) => p.id), ["pikachu"]);
});

test("searchPokemon: 英語名の大文字始まりでヒットする", () => {
  const result = searchPokemon(pokedexEntries, "Pikachu");
  assert.deepEqual(result.map((p) => p.id), ["pikachu"]);
});

test("searchPokemon: 英語名の小文字でヒットする", () => {
  const result = searchPokemon(pokedexEntries, "pikachu");
  assert.deepEqual(result.map((p) => p.id), ["pikachu"]);
});

test("searchPokemon: speciesIdの完全一致が部分一致より優先", () => {
  const items = [
    { id: "pikachu-libre", name: "Pikachu-Libre", nameJa: "ピカチュウ(ムチャブリ)", num: 25 },
    { id: "pikachu", name: "Pikachu", nameJa: "ピカチュウ", num: 25 },
  ];
  const result = searchPokemon(items, "pikachu");
  assert.deepEqual(result.map((p) => p.id), ["pikachu", "pikachu-libre"]);
});

test("searchPokemon: 図鑑番号の完全一致が最優先", () => {
  const result = searchPokemon(pokedexEntries, "25");
  assert.deepEqual(result.map((p) => p.id), ["pikachu"]);
});

test("searchPokemon: 英語名の前方一致が部分一致より優先", () => {
  const items = [
    { id: "raichu", name: "Raichu", nameJa: "ライチュウ", num: 26 }, // 部分一致のみ("chu"を含む)
    { id: "chuggle", name: "Chuggle", nameJa: "チャグル", num: 9001 }, // 前方一致("chu"で始まる)
  ];
  const result = searchPokemon(items, "chu");
  assert.deepEqual(result.map((i) => i.id), ["chuggle", "raichu"]);
});

test("searchPokemon: 部分一致のフォールバック(前方一致・完全一致なし)", () => {
  const result = searchPokemon(pokedexEntries, "izard");
  assert.deepEqual(result.map((p) => p.id), ["charizard"]);
});

test("searchPokemon: speciesId(id)のみの部分一致でもヒットする(名前には含まれない場合)", () => {
  const items = [{ id: "pikachu-libre", name: "Pikachu-Libre", nameJa: "ピカチュウ(ムチャブリ)", num: 25 }];
  const result = searchPokemon(items, "libre");
  assert.deepEqual(result.map((p) => p.id), ["pikachu-libre"]);
});

test("searchPokemon: 該当なしなら空配列を返す", () => {
  assert.deepEqual(searchPokemon(pokedexEntries, "存在しない"), []);
});

test("searchPokemon: queryが空文字なら空配列を返す", () => {
  assert.deepEqual(searchPokemon(pokedexEntries, ""), []);
});
