// データモデル（build/team/enemyTeam）のファクトリ・実数値計算・EVsバリデーション。
// 実数値(stats)はbuildに保存せず、種族値投入後にcalcAllStats等で都度導出する。

export const EV_STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const EV_MAX_PER_STAT = 252;
export const EV_MAX_TOTAL = 510;

export const NATURES = {
  "がんばりや": { plus: null, minus: null },
  "さみしがり": { plus: "atk", minus: "def" },
  "ゆうかん": { plus: "atk", minus: "spe" },
  "いじっぱり": { plus: "atk", minus: "spa" },
  "やんちゃ": { plus: "atk", minus: "spd" },
  "ずぶとい": { plus: "def", minus: "atk" },
  "すなお": { plus: null, minus: null },
  "のんき": { plus: "def", minus: "spe" },
  "わんぱく": { plus: "def", minus: "spa" },
  "のうてんき": { plus: "def", minus: "spd" },
  "おくびょう": { plus: "spe", minus: "atk" },
  "せっかち": { plus: "spe", minus: "def" },
  "まじめ": { plus: null, minus: null },
  "ようき": { plus: "spe", minus: "spa" },
  "むじゃき": { plus: "spe", minus: "spd" },
  "ひかえめ": { plus: "spa", minus: "atk" },
  "おっとり": { plus: "spa", minus: "def" },
  "れいせい": { plus: "spa", minus: "spe" },
  "てれや": { plus: null, minus: null },
  "うっかりや": { plus: "spa", minus: "spd" },
  "おだやか": { plus: "spd", minus: "atk" },
  "おとなしい": { plus: "spd", minus: "def" },
  "しんちょう": { plus: "spd", minus: "spa" },
  "きまぐれ": { plus: "spd", minus: "spe" },
  "てんねん": { plus: null, minus: null },
};

function defaultEvs(partial) {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...partial };
}

function defaultIvs(partial) {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...partial };
}

function createEnemyPokemon(partial = {}) {
  return {
    species: partial.species ?? "",
    ability: partial.ability ?? "",
    item: partial.item ?? "",
    moves: partial.moves ?? ["", "", "", ""],
    applyToOtherViews: partial.applyToOtherViews ?? false,
  };
}

export function createBuild(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? crypto.randomUUID(),
    speciesId: partial.speciesId ?? "",
    nickname: partial.nickname ?? "",
    types: partial.types ?? [], // TODO(種族データ投入後): 種族データから自動導出する
    ability: partial.ability ?? "", // TODO(種族データ投入後): 候補リストを実装する
    nature: partial.nature ?? "",
    item: partial.item ?? "",
    moves: partial.moves ?? ["", "", "", ""],
    candidateMoves: partial.candidateMoves ?? [],
    evs: defaultEvs(partial.evs),
    ivs: defaultIvs(partial.ivs),
    memo: partial.memo ?? "",
    weakAgainst: partial.weakAgainst ?? [],
    tags: partial.tags ?? [],
    teraType: partial.teraType ?? null, // 予約フィールド。UI非表示（レギュ解禁時に有効化）
    archived: partial.archived ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function createTeam(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "",
    selectedBuildIds: partial.selectedBuildIds ?? [],
    poolBuildIds: partial.poolBuildIds ?? [],
    speedCheckState: partial.speedCheckState ?? {},
    memo: partial.memo ?? "",
    archived: partial.archived ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function createEnemyTeam(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "",
    sourceType: partial.sourceType ?? "user",
    sourceUrl: partial.sourceUrl ?? "",
    pokemon: (partial.pokemon ?? []).map(createEnemyPokemon),
    registeredAt: partial.registeredAt ?? now,
    // 4.3には明記なしだが、db.setArchivedをenemyTeamsにも汎用適用するために追加（実装方針2.参照）
    archived: partial.archived ?? false,
  };
}

export function validateEvs(evs) {
  const errors = [];
  let total = 0;
  for (const key of EV_STAT_KEYS) {
    const value = evs?.[key] ?? 0;
    if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > EV_MAX_PER_STAT) {
      errors.push(`${key}は0〜${EV_MAX_PER_STAT}の範囲で指定してください`);
    }
    total += value;
  }
  if (total > EV_MAX_TOTAL) {
    errors.push(`努力値の合計は${EV_MAX_TOTAL}以下にしてください（現在: ${total}）`);
  }
  return { valid: errors.length === 0, errors };
}

export function calcStat(base, iv, ev, level = 50, natureMod = 1, isHp = false) {
  if (base == null || iv == null || ev == null) return null;
  const inner = Math.floor(((base * 2 + iv + Math.floor(ev / 4)) * level) / 100);
  if (isHp) return inner + level + 10;
  return Math.floor((inner + 5) * natureMod);
}

export function calcAllStats(baseStats, ivs, evs, nature, level = 50) {
  const base = baseStats ?? {};
  const iv = defaultIvs(ivs);
  const ev = defaultEvs(evs);
  const { plus, minus } = NATURES[nature] ?? {};
  const natureMod = (stat) => (stat === plus ? 1.1 : stat === minus ? 0.9 : 1.0);
  return {
    hp: calcStat(base.hp, iv.hp, ev.hp, level, 1, true),
    atk: calcStat(base.atk, iv.atk, ev.atk, level, natureMod("atk")),
    def: calcStat(base.def, iv.def, ev.def, level, natureMod("def")),
    spa: calcStat(base.spa, iv.spa, ev.spa, level, natureMod("spa")),
    spd: calcStat(base.spd, iv.spd, ev.spd, level, natureMod("spd")),
    spe: calcStat(base.spe, iv.spe, ev.spe, level, natureMod("spe")),
  };
}
