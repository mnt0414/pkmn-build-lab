// 素早さ比較タブのDOM非依存な純粋関数群（エントリ収集・スカーフ/おいかぜ/天候特性の合成・同速グループ化）。
// 対応する補正は初期版として性格・こだわりスカーフ・おいかぜ・天候特性のみ（要件定義書4.1.1）。
import { calcAllStats } from "./models.js";
import { CONFIG } from "./config.js";

function labelForBuild(build, pokedexById) {
  if (build.nickname) return build.nickname;
  const entry = pokedexById[build.speciesId];
  if (entry) return entry.nameJa ?? entry.name;
  return build.speciesId ?? "不明";
}

function labelForEnemyPokemon(pokemon, pokedexById) {
  const entry = pokemon.speciesId ? pokedexById[pokemon.speciesId] : null;
  if (entry) return entry.nameJa ?? entry.name;
  if (pokemon.species) return pokemon.species;
  return pokemon.speciesId ?? "不明";
}

// speciesId未解決・SP未入力のいずれかがあれば除外理由を積み上げて返す。両方欠けていれば両方積む。
// nature未入力は除外対象ではない（calcAllStatsが中立補正×1.0として扱う既存挙動に委ねる）。
function resolveCandidate({ side, sourceId, label, speciesId, statPoints, nature, item, ability, pokedexById }) {
  const entry = speciesId ? pokedexById[speciesId] : null;
  const reasons = [];
  if (!entry) reasons.push("種族データ不明");
  if (statPoints == null) reasons.push("SP未入力");
  if (reasons.length > 0) {
    return { excluded: { side, sourceId, label, reasons } };
  }
  const stats = calcAllStats(entry.baseStats, statPoints, nature);
  return {
    speedEntry: {
      side,
      sourceId,
      label,
      speciesId,
      baseSpe: stats.spe,
      item: item ?? null,
      ability: ability ?? null,
    },
  };
}

// 自チーム（構築メンバー6匹 + 選択された候補プールのbuild）と、反映ONの仮想敵構築の全ポケモンから
// 素早さ比較対象一覧を作る。teamBuildsはteamに紐づくbuild（member/pool両方）を含む配列を想定。
export function collectSpeedEntries({ team, teamBuilds = [], selectedPoolIds = [], enemyTeams = [], pokedexById }) {
  const entries = [];
  const excluded = [];

  const buildsById = new Map(teamBuilds.map((b) => [b.id, b]));
  const allyBuildIds = [...(team?.selectedBuildIds ?? []), ...selectedPoolIds];

  for (const buildId of allyBuildIds) {
    const build = buildsById.get(buildId);
    if (!build) continue; // 削除済み等のデータ不整合は静かにスキップ
    const result = resolveCandidate({
      side: "ally",
      sourceId: build.id,
      label: labelForBuild(build, pokedexById),
      speciesId: build.speciesId,
      statPoints: build.statPoints,
      nature: build.nature,
      item: build.item,
      ability: build.ability,
      pokedexById,
    });
    if (result.excluded) excluded.push(result.excluded);
    else entries.push(result.speedEntry);
  }

  const reflectedEnemyTeams = enemyTeams.filter((t) => t.isReflected);
  for (const enemyTeam of reflectedEnemyTeams) {
    (enemyTeam.pokemon ?? []).forEach((pokemon, index) => {
      const result = resolveCandidate({
        side: "enemy",
        sourceId: `${enemyTeam.id}:${index}`,
        label: labelForEnemyPokemon(pokemon, pokedexById),
        speciesId: pokemon.speciesId,
        statPoints: pokemon.statPoints,
        nature: pokemon.nature,
        item: pokemon.item,
        ability: pokemon.ability,
        pokedexById,
      });
      if (result.excluded) excluded.push(result.excluded);
      else entries.push(result.speedEntry);
    });
  }

  return { entries, excluded };
}

function weatherLabel(weatherId, speedConfig) {
  const w = (speedConfig.weathers ?? []).find((x) => x.id === weatherId);
  return w ? w.label : weatherId;
}

function matchesAbility(ability, aliases) {
  if (!ability) return false;
  const trimmed = ability.trim();
  return (aliases ?? []).some((a) => a === trimmed);
}

// entryへ適用される補正の合成。倍率は全て掛け合わせてから最後に1回だけfloorする
// （ゲーム準拠: 段階的にfloorすると101×1.5×2のようなケースで302という誤った値になる）。
export function computeFinalSpeed(entry, { weather = "none", allyTailwind = false, enemyTailwind = false } = {}, speedConfig = CONFIG.speed) {
  const modifiers = [];
  let multiplier = 1;

  const itemName = (entry.item ?? "").trim();
  if (itemName && itemName === speedConfig.scarfItemName) {
    modifiers.push({ label: speedConfig.scarfItemName, multiplier: 1.5 });
    multiplier *= 1.5;
  }

  const weatherAbility = (speedConfig.weatherAbilities ?? []).find(
    (w) => w.weather === weather && matchesAbility(entry.ability, w.abilityAliases),
  );
  if (weatherAbility) {
    modifiers.push({ label: `${weatherLabel(weather, speedConfig)}・${weatherAbility.label}`, multiplier: weatherAbility.multiplier });
    multiplier *= weatherAbility.multiplier;
  }

  const tailwindOn = entry.side === "ally" ? allyTailwind : enemyTailwind;
  if (tailwindOn) {
    modifiers.push({ label: "おいかぜ", multiplier: 2 });
    multiplier *= 2;
  }

  const finalSpeed = Math.floor(entry.baseSpe * multiplier);
  return { finalSpeed, modifiers };
}

// team.speedCheckState（永続化された比較UIの状態）を安全な既定値で正規化する。
// poolBuildIdsに存在しないselectedPoolIdsは無視する（構築編集等でプールから消えたIDの残骸対策）。
export function normalizeSpeedCheckState(team) {
  const raw = team?.speedCheckState ?? {};
  const validPoolIds = new Set(team?.poolBuildIds ?? []);
  const selectedPoolIds = Array.isArray(raw.selectedPoolIds)
    ? raw.selectedPoolIds.filter((id) => validPoolIds.has(id))
    : [];
  return {
    selectedPoolIds,
    weather: raw.weather ?? "none",
    allyTailwind: Boolean(raw.allyTailwind),
    enemyTailwind: Boolean(raw.enemyTailwind),
  };
}

// finalSpeed降順で、同じfinalSpeedのエントリを1グループにまとめる。
export function groupBySpeed(entriesWithSpeed) {
  const sorted = [...entriesWithSpeed].sort((a, b) => b.finalSpeed - a.finalSpeed);
  const groups = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.speed === item.finalSpeed) {
      last.entries.push(item);
    } else {
      groups.push({ speed: item.finalSpeed, entries: [item] });
    }
  }
  return groups;
}
