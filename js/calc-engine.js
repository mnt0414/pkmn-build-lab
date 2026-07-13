// @smogon/calc（CDN経由ESM）の薄いラッパー。Phase 5.0時点では骨格のみ。
// 注意: bare URL（/+esmサフィックスなし）はCommonJS解決になりrequire is not definedエラーになるため、
// 必ず/+esmを付けること（BATTLEREC側で検証済み）。
import * as smogon from "https://cdn.jsdelivr.net/npm/@smogon/calc@0.11/+esm";
import { calcAllStats } from "./models.js";
import { getPokedex, getMoves } from "./static-data.js";
import { TYPE_JA } from "./type-names.js";

export function getSmogonCalc() {
  return smogon;
}

// 動作確認用（後続サブフェーズで本実装する際に置き換える想定）
export function getGeneration() {
  return smogon.Generations.get(9);
}

// --- Phase 5.1: ダメージ計算エンジンのコア移植（BATTLEREC js/calc.js からの移植、DOM非依存） ---

const TYPE_EN_BY_JA = Object.fromEntries(Object.entries(TYPE_JA).map(([en, ja]) => [ja, en]));
const HK_TO_STAT_KEY = { H: "hp", A: "atk", B: "def", C: "spa", D: "spd", S: "spe" };
const WEATHER_ID_TO_EN = { rain: "Rain", sun: "Sun", sand: "Sand", snow: "Snow" };
// 地形はCONFIG側に既存の対応表がないため、天候と同じ命名規則（英語小文字id）でここに新規定義する。
const TERRAIN_ID_TO_EN = { electric: "Electric", grassy: "Grassy", misty: "Misty", psychic: "Psychic" };
const GAME_TYPE_TO_EN = { single: "Singles", double: "Doubles" };

let overlayPromise = null;

// data/sources/champions_overlay.json（技威力/命中差分・メガシンカ・特性ポストマルチプライヤーの上書き元）を取得しキャッシュする。
// data/dist配下の生成物と異なり{data:...}の封筒形式を持たない生JSONなので、そのまま返す。
export async function getOverlay() {
  if (!overlayPromise) {
    overlayPromise = fetch("data/sources/champions_overlay.json")
      .then((res) => {
        if (!res.ok) throw new Error(`data/sources/champions_overlay.json の取得に失敗しました（status: ${res.status}）`);
        return res.json();
      })
      .catch((err) => {
        overlayPromise = null;
        throw err;
      });
  }
  return overlayPromise;
}

let nameJaLookupPromise = null;

// pokedex.json/moves.jsonから、champions_overlay.jsonの日本語キー（技名・特性名）を解決するための逆引きテーブルを構築する。
// 技: 日本語技名 -> moveId（英語）。特性: 日本語特性名 -> 英語特性名（@smogon/calcのability解決用）。
export async function getNameJaLookup() {
  if (!nameJaLookupPromise) {
    nameJaLookupPromise = (async () => {
      const [pokedex, moves] = await Promise.all([getPokedex(), getMoves()]);
      const moveJaToId = new Map();
      for (const move of Object.values(moves)) {
        if (move.nameJa) moveJaToId.set(move.nameJa, move.id);
      }
      const abilityJaToEn = new Map();
      for (const entry of Object.values(pokedex)) {
        const abilities = entry.abilities ?? {};
        const abilitiesJa = entry.abilitiesJa ?? {};
        for (const slot of Object.keys(abilities)) {
          const en = abilities[slot];
          const ja = abilitiesJa[slot];
          if (en && ja && !abilityJaToEn.has(ja)) abilityJaToEn.set(ja, en);
        }
      }
      return { moves: moveJaToId, abilities: abilityJaToEn };
    })().catch((err) => {
      nameJaLookupPromise = null;
      throw err;
    });
  }
  return nameJaLookupPromise;
}

// 実数値からエンジン用の疑似baseStatsを逆算する（BATTLEREC calc.js:injBase相当）。
// @smogon/calcが個体値31・努力値0・性格無補正・レベル50で算出する種族値ベースの実数値と、
// チャンピオンズ仕様（ステータスポイント制）の実数値計算式とのズレを補正するための経験的な値。
// 通常ステータス: 実数値-20、HPのみ: 実数値-75（BATTLEREC側で検証済みのマジックナンバー。変更しないこと）。
export function injectedBaseStats(finalStats) {
  return {
    hp: finalStats.hp - 75,
    atk: finalStats.atk - 20,
    def: finalStats.def - 20,
    spa: finalStats.spa - 20,
    spd: finalStats.spd - 20,
    spe: finalStats.spe - 20,
  };
}

function convertMegaBaseStats(hkBaseStats) {
  const out = {};
  for (const [hk, key] of Object.entries(HK_TO_STAT_KEY)) out[key] = hkBaseStats[hk];
  return out;
}

// build.ability（またはenemyPokemon.ability）は英語（パーティのセレクト由来）・日本語（仮想敵の自由入力）の
// どちらも入りうる。日本語で登録済みの実在特性ならnameJaLookupで英語名に変換し、それ以外（英語名／
// チャンピオンズ独自の非公式特性名）はそのまま@smogon/calcに渡す（解決できなければ効果なし扱いになる想定）。
// 実機確認済み: 未解決の特性文字列（例: 存在しない特性名）はcalculate()実行時に例外を起こさず、
// 単に効果なしとして扱われる（itemと異なりクラッシュリスクはない）。
function resolveAbilityForEngine(abilityRaw, nameJaLookup) {
  if (!abilityRaw) return undefined;
  return nameJaLookup.abilities.get(abilityRaw) ?? abilityRaw;
}

// もちものは自由入力テキスト保存のため英語変換手段がなく、多くの場合は日本語の生文字列になる。
// 実機確認の結果、未解決の文字列をそのままPokemonのitemに渡すと、防御側の場合にcalculate()が
// 「Cannot read properties of undefined (reading 'megaStone')」で例外を投げることが判明した
// （攻撃側は問題なし。メガストーン自動判定と思われる内部処理が防御側itemの解決失敗で落ちる）。
// そのため@smogon/calc自身のitem辞書（gen.items、toIDで正規化）で事前に実在チェックし、
// 解決できた場合のみ正式な英語表示名を渡し、解決できなければ持ち物なし（undefined）として扱う。
function resolveItemForEngine(itemRaw, gen, notesOut, sideLabel) {
  if (!itemRaw) return undefined;
  const resolved = gen.items.get(smogon.toID(itemRaw));
  if (resolved) return resolved.name;
  notesOut.push(`持ち物未解決のため未装備として扱いました: ${itemRaw}（${sideLabel}）`);
  return undefined;
}

// pkmn-build-labのbuild（またはenemyPokemon、同じ形状のプロパティを持つ想定）から
// @smogon/calcのPokemonインスタンスを構築する（BATTLEREC calc.js:buildSide相当）。
export async function buildPokemon(build, pokedexEntry, options = {}) {
  const notes = [];
  if (!pokedexEntry) {
    return { error: `種族データが見つかりません: ${build?.speciesId ?? "(不明)"}` };
  }

  let baseStatsForCalc = pokedexEntry.baseStats;
  let typesOverride = null;
  let megaAbilityJa = null;
  const megaNameJa = options.megaNameJa ?? null;

  if (megaNameJa) {
    const overlay = await getOverlay();
    const mega = overlay?.megas?.[megaNameJa];
    if (mega) {
      baseStatsForCalc = convertMegaBaseStats(mega.baseStats);
      typesOverride = (mega.types ?? []).map((ja) => TYPE_EN_BY_JA[ja]).filter(Boolean);
      if (mega.abilities?.length) {
        megaAbilityJa = mega.abilities[0];
      } else {
        notes.push(`メガ: ${megaNameJa}（特性未確定）`);
      }
      notes.push(`メガシンカ適用: ${megaNameJa}`);
    } else {
      notes.push(`メガシンカ情報が見つかりません: ${megaNameJa}`);
    }
  }

  const finalStats = calcAllStats(baseStatsForCalc, build.statPoints, build.nature);
  if (!finalStats) {
    return { error: "ステータスポイント未入力のため実数値を計算できません" };
  }

  const gen = getGeneration();
  const speciesId = build.speciesId;
  const species = speciesId ? gen.species.get(speciesId) : null;
  if (speciesId && !species) {
    notes.push(`種族情報の解決に失敗しました（@smogon/calc側で未認識）: speciesId=${speciesId}`);
  }
  const speciesNameForCalc = species?.name ?? pokedexEntry.name ?? speciesId;

  const nameJaLookup = await getNameJaLookup();
  const abilityRaw = megaAbilityJa ?? build.ability;
  const ability = resolveAbilityForEngine(abilityRaw, nameJaLookup);

  const overrides = { baseStats: injectedBaseStats(finalStats) };
  if (typesOverride && typesOverride.length) overrides.types = typesOverride;

  const opt = {
    level: 50,
    nature: "Hardy",
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    // もちものは自由入力テキスト保存のため英語変換手段がない。@smogon/calc自身のitem辞書で
    // 解決できた場合のみ渡し、解決できなければ「もちものなし」として扱う（割り切り、完了報告に明記）。
    item: resolveItemForEngine(build.item, gen, notes, options.sideLabel ?? "対象ポケモン"),
    ability,
    boosts: {}, // Phase5.1時点ではランク補正UI未実装のため常に補正なし
    overrides,
  };

  let pokemon;
  try {
    pokemon = new smogon.Pokemon(gen, speciesNameForCalc, opt);
  } catch (err) {
    return { error: `ポケモンの構築に失敗しました: ${err.message}` };
  }

  return { pokemon, finalStats, notes };
}

// moveId（英語）からchampions_overlay.jsonの技差分（威力/命中）を適用した@smogon/calcのMoveインスタンスを
// 構築する（BATTLEREC calc.js:prepMove相当）。moveDataは既にnameJaを保持しているため、
// getNameJaLookup()の技逆引きMapを介さずそのまま照合する（車輪の再発明を避ける）。
// options.isCrit: trueなら急所ヒット扱い（BATTLEREC calc.js:calcOnceの`pm.move.isCrit=true`相当）。
export async function buildMove(moveId, options = {}) {
  const notes = [];
  const moves = await getMoves();
  const moveData = moves[moveId];
  if (!moveData) {
    return { error: `技データが見つかりません: ${moveId}` };
  }

  const overlay = await getOverlay();
  const ov = moveData.nameJa ? overlay?.moves?.[moveData.nameJa] : null;
  const overrides = {};
  if (ov?.basePower != null) {
    overrides.basePower = ov.basePower;
    notes.push(`威力変更（${ov.note ?? ""}）`);
  }
  if (ov?.accuracy != null) {
    overrides.accuracy = ov.accuracy;
    notes.push(`命中変更（${ov.note ?? ""}）`);
  }

  const gen = getGeneration();
  let move;
  try {
    move = new smogon.Move(gen, moveData.name, Object.keys(overrides).length ? { overrides } : undefined);
    if (options.isCrit) move.isCrit = true;
  } catch (err) {
    return { error: `技の構築に失敗しました: ${err.message}` };
  }

  return { move, mult: 1, notes };
}

// フィールド状況（天候・地形・壁・てだすけ・シングル/ダブル）から@smogon/calcのFieldインスタンスを
// 構築する（BATTLEREC calc.js:buildField相当）。
export function buildField(options = {}) {
  const opt = { gameType: GAME_TYPE_TO_EN[options.gameType] ?? "Singles" };
  const weatherEn = WEATHER_ID_TO_EN[options.weather];
  if (weatherEn) opt.weather = weatherEn;
  const terrainEn = TERRAIN_ID_TO_EN[options.terrain];
  if (terrainEn) opt.terrain = terrainEn;

  const field = new smogon.Field(opt);
  field.defenderSide = new smogon.Side({ isReflect: !!options.reflect, isLightScreen: !!options.lightScreen });
  field.attackerSide = new smogon.Side({ isHelpingHand: !!options.helpingHand });
  return field;
}

// champions_overlay.jsonのabilitiesのうち、単純なポストマルチプライヤー（mult値のみ、
// fromType/toTypeによるタイプ変換・weatherによる天候変換を伴わないもの）のみ適用する。
// タイプ変換系・天候変換系は今回は対応を見送り、notesに理由を残す（完了報告に一覧を明記）。
function applyAbilityOverlayMult(abilityRaw, moveTypeEn, overlay, sideLabel, notesOut) {
  if (!abilityRaw) return 1;
  const ov = overlay?.abilities?.[abilityRaw];
  if (!ov) return 1;
  if (ov.fromType || ov.weather) {
    notesOut.push(`特性補正未対応: ${abilityRaw}（${sideLabel}）`);
    return 1;
  }
  if (typeof ov.mult !== "number") return 1;
  // type指定あり（例: ほのおのたてがみ）の場合は該当タイプの技のみ倍率を適用する。
  if (ov.type && TYPE_EN_BY_JA[ov.type] !== moveTypeEn) return 1;
  notesOut.push(`特性 ${abilityRaw} ×${ov.mult}（${sideLabel}）`);
  return ov.mult;
}

// 攻撃側・防御側のbuild/pokedexEntry・技id・フィールド状況からダメージ計算を実行する
// （BATTLEREC calc.js:calcOnce相当）。
export async function calculateDamage(
  atkBuild,
  atkPokedexEntry,
  defBuild,
  defPokedexEntry,
  moveId,
  fieldOptions = {},
  options = {},
) {
  const atk = await buildPokemon(atkBuild, atkPokedexEntry, {
    megaNameJa: options.atkMegaNameJa ?? null,
    sideLabel: "攻撃側",
  });
  if (atk.error) return { error: atk.error };

  const def = await buildPokemon(defBuild, defPokedexEntry, {
    megaNameJa: options.defMegaNameJa ?? null,
    sideLabel: "防御側",
  });
  if (def.error) return { error: def.error };

  const moveResult = await buildMove(moveId, { isCrit: options.isCrit });
  if (moveResult.error) return { error: moveResult.error };

  const field = buildField(fieldOptions);

  let result;
  try {
    result = smogon.calculate(getGeneration(), atk.pokemon, def.pokemon, moveResult.move, field);
  } catch (err) {
    return { error: `ダメージ計算に失敗しました: ${err.message}` };
  }

  let [min, max] = result.range();
  const notes = [...atk.notes, ...def.notes, ...moveResult.notes];

  const overlay = await getOverlay();
  const moveTypeEn = moveResult.move.type;
  const atkMult = applyAbilityOverlayMult(atkBuild?.ability, moveTypeEn, overlay, "攻撃側", notes);
  const defMult = applyAbilityOverlayMult(defBuild?.ability, moveTypeEn, overlay, "防御側", notes);
  const totalMult = atkMult * defMult;
  if (totalMult !== 1) {
    min = Math.floor(min * totalMult);
    max = Math.floor(max * totalMult);
  }

  const defenderHp = def.finalStats.hp;
  const minPercent = Math.round((min / defenderHp) * 1000) / 10;
  const maxPercent = Math.round((max / defenderHp) * 1000) / 10;
  const minHitsToKo = max > 0 ? Math.ceil(defenderHp / max) : null; // 最大乱数時に必要な最少回数
  const maxHitsToKo = min > 0 ? Math.ceil(defenderHp / min) : null; // 最小乱数時に必要な最多回数

  let description = "";
  try {
    description = result.desc();
  } catch (err) {
    // desc()の失敗は計算結果自体の有効性に影響しないため無視する（BATTLEREC側と同様の扱い）。
  }

  return {
    ok: true,
    minDamage: min,
    maxDamage: max,
    defenderHp,
    minPercent,
    maxPercent,
    minHitsToKo,
    maxHitsToKo,
    description,
    notes,
  };
}
