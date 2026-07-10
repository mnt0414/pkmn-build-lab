// データモデル（build/team/enemyTeam）のファクトリ・実数値計算・ステータスポイントバリデーション。
// ポケモンチャンピオンズ仕様: 努力値(EVs)は廃止し、ステータスポイント(SP・各0〜32、合計0〜66)を採用。
// 個体値(ivs)は常に31固定・UI編集対象外。実数値(stats)はbuildに保存せず、都度calcAllStats等で導出する。

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const SP_MAX_PER_STAT = 32;
export const SP_MAX_TOTAL = 66;

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

// チャンピオンズ仕様では個体値は常に31固定・UI編集対象外。この関数の返り値は変更してはならない。
function fixedIvs() {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
}

function createEnemyPokemon(partial = {}) {
  return {
    species: partial.species ?? "",
    ability: partial.ability ?? "",
    item: partial.item ?? "",
    moves: partial.moves ?? ["", "", "", ""],
  };
}

export function createBuild(partial = {}) {
  if (!partial.speciesId) throw new Error("speciesIdは必須です");
  if (!partial.teamId) throw new Error("teamIdは必須です");
  const now = new Date().toISOString();
  return {
    id: partial.id ?? crypto.randomUUID(),
    teamId: partial.teamId,
    speciesId: partial.speciesId,
    nickname: partial.nickname ?? null,
    types: partial.types ?? [], // TODO(種族データ投入後): 種族データから自動導出する
    ability: partial.ability ?? null, // TODO(種族データ投入後): 候補リストを実装する
    nature: partial.nature ?? null,
    item: partial.item ?? null,
    moves: partial.moves ?? [null, null, null, null],
    candidateMoves: partial.candidateMoves ?? [],
    statPoints: partial.statPoints ?? null, // 各0〜32・合計0〜66。未入力時はnull
    ivs: fixedIvs(), // 常に31固定（変更不可）
    memo: partial.memo ?? null,
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
    battleFormat: partial.battleFormat ?? "single", // "single" | "double"
    regulation: partial.regulation ?? "",
    selectedBuildIds: partial.selectedBuildIds ?? [],
    poolBuildIds: partial.poolBuildIds ?? [],
    speedCheckState: partial.speedCheckState ?? {},
    memo: partial.memo ?? "",
    archived: partial.archived ?? false,
    sortOrder: partial.sortOrder ?? Date.now(),
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
    battleFormat: partial.battleFormat ?? "single", // "single" | "double"
    regulation: partial.regulation ?? "",
    sourceUrl: partial.sourceUrl ?? "",
    pokemon: (partial.pokemon ?? []).map(createEnemyPokemon), // teamId不要
    registeredAt: partial.registeredAt ?? now,
    isReflected: partial.isReflected ?? true, // 構築単位の反映フラグ（preset/userとも初期値true）
    // 4.3にarchivedの明記はないが、db.setArchivedの汎用適用に実害がないため残置（完了報告で明示）
    archived: partial.archived ?? false,
  };
}

// statPointsがnullの場合は未入力として許容する（保存を妨げない）。
export function validateStatPoints(statPoints) {
  if (statPoints == null) return { valid: true, errors: [] };
  const errors = [];
  let total = 0;
  for (const key of STAT_KEYS) {
    const value = statPoints[key];
    if (!Number.isInteger(value) || value < 0 || value > SP_MAX_PER_STAT) {
      errors.push(`${key}は0〜${SP_MAX_PER_STAT}の整数で指定してください`);
    } else {
      total += value;
    }
  }
  if (total > SP_MAX_TOTAL) {
    errors.push(`ステータスポイントの合計は${SP_MAX_TOTAL}以下にしてください（現在: ${total}）`);
  }
  return { valid: errors.length === 0, errors };
}

// チャンピオンズ仕様の実数値計算式（個体値は常に31固定）。
// HP: floor(((2*base+31)*level)/100) + level + 10 + SP
// HP以外・性格補正前: floor(((2*base+31)*level)/100) + 5 + SP
// HP以外・性格補正後: floor(性格補正前 * 性格倍率)
export function calcStat(base, sp, level = 50, natureMod = 1, isHp = false) {
  if (base == null || sp == null) return null;
  const inner = Math.floor(((base * 2 + 31) * level) / 100);
  if (isHp) return inner + level + 10 + sp;
  return Math.floor((inner + 5 + sp) * natureMod);
}

// statPointsがnull（未入力）の場合は実数値計算ができないためnullを返す。
export function calcAllStats(baseStats, statPoints, nature, level = 50) {
  if (statPoints == null) return null;
  const base = baseStats ?? {};
  const { plus, minus } = NATURES[nature] ?? {};
  const natureMod = (stat) => (stat === plus ? 1.1 : stat === minus ? 0.9 : 1.0);
  return {
    hp: calcStat(base.hp, statPoints.hp, level, 1, true),
    atk: calcStat(base.atk, statPoints.atk, level, natureMod("atk")),
    def: calcStat(base.def, statPoints.def, level, natureMod("def")),
    spa: calcStat(base.spa, statPoints.spa, level, natureMod("spa")),
    spd: calcStat(base.spd, statPoints.spd, level, natureMod("spd")),
    spe: calcStat(base.spe, statPoints.spe, level, natureMod("spe")),
  };
}
