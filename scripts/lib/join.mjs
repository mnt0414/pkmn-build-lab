// CSV(pokemon_list.csv)の1行をpokedexのspeciesIdへ解決する共通ロジック。data-build.mjs/data-verify.mjsで共有する。

export function buildBaseByNum(pokedex) {
  const map = new Map();
  for (const entry of Object.values(pokedex)) {
    if (entry.forme === "") map.set(String(entry.num), entry.id);
  }
  return map;
}

// { ok: true, speciesId } または { ok: false, reason }
export function resolveCsvRow(row, pokedex, formMap, baseByNum) {
  if (row.sprite_override) {
    const candidateId = formMap[row.sprite_override];
    if (!candidateId) {
      return { ok: false, reason: `sprite_override未解決: ${row.sprite_override}` };
    }
    const candidate = pokedex[candidateId];
    if (!candidate) {
      return { ok: false, reason: `form-map参照先がpokedexに存在しない: ${candidateId}` };
    }
    if (String(candidate.num) !== row.no) {
      return {
        ok: false,
        reason: `num不一致: sprite_override=${row.sprite_override} csv.no=${row.no} 解決先=${candidateId}(num=${candidate.num})`,
      };
    }
    return { ok: true, speciesId: candidateId };
  }
  const baseId = baseByNum.get(row.no);
  if (!baseId) {
    return { ok: false, reason: `基本フォルムが見つからない: no=${row.no}` };
  }
  return { ok: true, speciesId: baseId };
}
