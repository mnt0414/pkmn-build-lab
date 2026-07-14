// ポケモンの識別表示（スプライト画像）の共通ヘルパー。
// party.js の speedEntryHtml にあったスプライト表示パターンを共通化したもの。
import { escapeHtml, safeHttpsUrl } from "./utils.js";

// pokedexEntryのスプライトを表示する<img>を返す。spriteUrlが無効な場合は先頭1文字のみの軽量なフォールバックを返す。
// pokedexEntry自体が無い場合は空文字列を返す。
export function spriteImgHtml(pokedexEntry, { size = 40, className = "" } = {}) {
  if (!pokedexEntry) return "";
  const classAttr = className ? ` ${escapeHtml(className)}` : "";
  const spriteUrl = safeHttpsUrl(pokedexEntry.spriteUrl);
  if (spriteUrl) {
    return `<img class="sprite-img${classAttr}" src="${escapeHtml(spriteUrl)}" alt="" style="width:${size}px;height:${size}px" onerror="this.style.display='none'">`;
  }
  const name = pokedexEntry.nameJa ?? pokedexEntry.name ?? "";
  const initial = escapeHtml(name.slice(0, 1));
  return `<div class="sprite-fallback${classAttr}" style="width:${size}px;height:${size}px">${initial}</div>`;
}
