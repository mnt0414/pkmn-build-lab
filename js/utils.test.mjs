import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, safeHttpsUrl, hiraganaToKatakana, searchByName } from "./utils.js";

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
