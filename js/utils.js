// 共通ヘルパー
// ユーザー入力・外部データをinnerHTMLに埋め込む際は必ずescapeHtmlを通すこと（自XSS防止）。
export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 外部リンクはHTTPSのみ許可。無効値・javascript:・data:等はnullにする。
export function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// ひらがなをカタカナに変換する(コードポイント+0x60)。図鑑名(カタカナ表記)をひらがな入力で検索できるようにする正規化用。
export function hiraganaToKatakana(str) {
  return String(str ?? "").replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

// query(ひらがな入力可)でitems内をname部分一致検索し、前方一致のものを先頭にした順序で返す(部分一致のみのものは後ろ)。
// getName: 各itemから検索対象の名前文字列を取り出す関数。queryが空文字なら空配列を返す。
export function searchByName(items, query, getName) {
  const q = hiraganaToKatakana(query.trim().toLowerCase());
  if (!q) return [];
  const starts = [];
  const rest = [];
  for (const item of items) {
    const name = hiraganaToKatakana(getName(item).toLowerCase());
    if (name.startsWith(q)) starts.push(item);
    else if (name.includes(q)) rest.push(item);
  }
  return [...starts, ...rest];
}

// query(ひらがな入力可)でpokedexエントリ(nameJa/name/id/num)を検索する。優先順位:
// 1) 図鑑番号(num)の完全一致 → 2) speciesId(id)の完全一致 → 3) 日本語名/英語名の前方一致 → 4) 日本語名/英語名/speciesIdの部分一致
// queryが空文字なら空配列を返す。
export function searchPokemon(items, query) {
  const raw = query.trim();
  if (!raw) return [];
  const q = hiraganaToKatakana(raw.toLowerCase());
  const qNum = /^\d+$/.test(raw) ? Number(raw) : null;
  const exactNum = [];
  const exactId = [];
  const starts = [];
  const rest = [];
  for (const item of items) {
    const nameJa = hiraganaToKatakana(String(item.nameJa ?? "").toLowerCase());
    const nameEn = String(item.name ?? "").toLowerCase();
    const id = String(item.id ?? "").toLowerCase();
    if (qNum !== null && item.num === qNum) exactNum.push(item);
    else if (id === q) exactId.push(item);
    else if (nameJa.startsWith(q) || nameEn.startsWith(q)) starts.push(item);
    else if (nameJa.includes(q) || nameEn.includes(q) || id.includes(q)) rest.push(item);
  }
  return [...exactNum, ...exactId, ...starts, ...rest];
}
