import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSpeedEntries, computeFinalSpeed, groupBySpeed } from "./speed-logic.js";
import { CONFIG } from "./config.js";

const pokedexById = {
  pikachu: { name: "Pikachu", nameJa: "ピカチュウ", baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 } },
  kingdra: { name: "Kingdra", nameJa: "キングドラ", baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 } },
};

// --- 基礎実数値（性格補正込み） ---

test("collectSpeedEntries: SP0・無補正の実数値は120", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: [] };
  const teamBuilds = [{ id: "b1", speciesId: "pikachu", nickname: null, nature: "がんばりや", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }];
  const { entries } = collectSpeedEntries({ team, teamBuilds, pokedexById });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].baseSpe, 120);
});

test("collectSpeedEntries: SP1の実数値は121", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: [] };
  const teamBuilds = [{ id: "b1", speciesId: "pikachu", nickname: null, nature: "がんばりや", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 1 } }];
  const { entries } = collectSpeedEntries({ team, teamBuilds, pokedexById });
  assert.equal(entries[0].baseSpe, 121);
});

test("collectSpeedEntries: SP32の実数値は152", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: [] };
  const teamBuilds = [{ id: "b1", speciesId: "pikachu", nickname: null, nature: "がんばりや", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 32 } }];
  const { entries } = collectSpeedEntries({ team, teamBuilds, pokedexById });
  assert.equal(entries[0].baseSpe, 152);
});

test("collectSpeedEntries: 性格上昇補正（おくびょう）SP0はfloor(120*1.1)=132", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: [] };
  const teamBuilds = [{ id: "b1", speciesId: "pikachu", nickname: null, nature: "おくびょう", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }];
  const { entries } = collectSpeedEntries({ team, teamBuilds, pokedexById });
  assert.equal(entries[0].baseSpe, 132);
});

test("collectSpeedEntries: 性格下降補正（ゆうかん）SP0はfloor(120*0.9)=108", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: [] };
  const teamBuilds = [{ id: "b1", speciesId: "pikachu", nickname: null, nature: "ゆうかん", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }];
  const { entries } = collectSpeedEntries({ team, teamBuilds, pokedexById });
  assert.equal(entries[0].baseSpe, 108);
});

// --- computeFinalSpeed: スカーフ ---

test("computeFinalSpeed: こだわりスカーフで実数値120は180になる", () => {
  const entry = { side: "ally", baseSpe: 120, item: "こだわりスカーフ", ability: null };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "none" });
  assert.equal(finalSpeed, 180);
  assert.deepEqual(modifiers, [{ label: "こだわりスカーフ", multiplier: 1.5 }]);
});

test("computeFinalSpeed: こだわりスカーフで実数値101はfloor(151.5)=151になる", () => {
  const entry = { side: "ally", baseSpe: 101, item: "こだわりスカーフ", ability: null };
  const { finalSpeed } = computeFinalSpeed(entry, { weather: "none" });
  assert.equal(finalSpeed, 151);
});

test("computeFinalSpeed: スカーフ以外の持ち物は補正されない", () => {
  const entry = { side: "ally", baseSpe: 120, item: "きあいのタスキ", ability: null };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "none" });
  assert.equal(finalSpeed, 120);
  assert.deepEqual(modifiers, []);
});

// --- computeFinalSpeed: 天候特性（各4種） ---

test("computeFinalSpeed: 雨+すいすい(英語名保存)で×2になる", () => {
  const entry = { side: "ally", baseSpe: 100, item: null, ability: "Swift Swim" };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "rain" });
  assert.equal(finalSpeed, 200);
  assert.deepEqual(modifiers, [{ label: "雨・すいすい", multiplier: 2 }]);
});

test("computeFinalSpeed: 雨+すいすい(日本語名保存)で×2になる", () => {
  const entry = { side: "enemy", baseSpe: 100, item: null, ability: "すいすい" };
  const { finalSpeed } = computeFinalSpeed(entry, { weather: "rain" });
  assert.equal(finalSpeed, 200);
});

test("computeFinalSpeed: 晴れ+ようりょくそで×2になる", () => {
  const entry = { side: "ally", baseSpe: 100, item: null, ability: "Chlorophyll" };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "sun" });
  assert.equal(finalSpeed, 200);
  assert.deepEqual(modifiers, [{ label: "晴れ・ようりょくそ", multiplier: 2 }]);
});

test("computeFinalSpeed: 砂嵐+すなかきで×2になる", () => {
  const entry = { side: "ally", baseSpe: 100, item: null, ability: "Sand Rush" };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "sand" });
  assert.equal(finalSpeed, 200);
  assert.deepEqual(modifiers, [{ label: "砂嵐・すなかき", multiplier: 2 }]);
});

test("computeFinalSpeed: 雪+ゆきかきで×2になる", () => {
  const entry = { side: "ally", baseSpe: 100, item: null, ability: "Slush Rush" };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "snow" });
  assert.equal(finalSpeed, 200);
  assert.deepEqual(modifiers, [{ label: "雪・ゆきかき", multiplier: 2 }]);
});

test("computeFinalSpeed: 天候が一致しない場合は補正されない", () => {
  const entry = { side: "ally", baseSpe: 100, item: null, ability: "Swift Swim" };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "sun" });
  assert.equal(finalSpeed, 100);
  assert.deepEqual(modifiers, []);
});

test("computeFinalSpeed: 天候特性を持たないポケモンは天候がきても補正なし", () => {
  const entry = { side: "ally", baseSpe: 100, item: null, ability: "ふゆう" };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "rain" });
  assert.equal(finalSpeed, 100);
  assert.deepEqual(modifiers, []);
});

// --- computeFinalSpeed: おいかぜ ---

test("computeFinalSpeed: 味方おいかぜONで味方側エントリは×2になる", () => {
  const entry = { side: "ally", baseSpe: 100, item: null, ability: null };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "none", allyTailwind: true });
  assert.equal(finalSpeed, 200);
  assert.deepEqual(modifiers, [{ label: "おいかぜ", multiplier: 2 }]);
});

test("computeFinalSpeed: 味方おいかぜONでも敵側エントリは変化しない", () => {
  const entry = { side: "enemy", baseSpe: 100, item: null, ability: null };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "none", allyTailwind: true });
  assert.equal(finalSpeed, 100);
  assert.deepEqual(modifiers, []);
});

test("computeFinalSpeed: 相手おいかぜONで敵側エントリのみ×2になる", () => {
  const ally = { side: "ally", baseSpe: 100, item: null, ability: null };
  const enemy = { side: "enemy", baseSpe: 100, item: null, ability: null };
  const opts = { weather: "none", enemyTailwind: true };
  assert.equal(computeFinalSpeed(ally, opts).finalSpeed, 100);
  assert.equal(computeFinalSpeed(enemy, opts).finalSpeed, 200);
});

// --- computeFinalSpeed: 複合補正の一括floor ---

test("computeFinalSpeed: スカーフ+おいかぜは実数値101×3.0=303（段階floorの302にならない）", () => {
  const entry = { side: "ally", baseSpe: 101, item: "こだわりスカーフ", ability: null };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "none", allyTailwind: true });
  assert.equal(finalSpeed, 303);
  assert.deepEqual(modifiers, [
    { label: "こだわりスカーフ", multiplier: 1.5 },
    { label: "おいかぜ", multiplier: 2 },
  ]);
});

test("computeFinalSpeed: スカーフ+天候特性は実数値101×3.0=303", () => {
  const entry = { side: "ally", baseSpe: 101, item: "こだわりスカーフ", ability: "Swift Swim" };
  const { finalSpeed } = computeFinalSpeed(entry, { weather: "rain" });
  assert.equal(finalSpeed, 303);
});

test("computeFinalSpeed: スカーフ+天候特性+おいかぜは実数値101×6.0=606", () => {
  const entry = { side: "ally", baseSpe: 101, item: "こだわりスカーフ", ability: "Swift Swim" };
  const { finalSpeed, modifiers } = computeFinalSpeed(entry, { weather: "rain", allyTailwind: true });
  assert.equal(finalSpeed, 606);
  assert.equal(modifiers.length, 3);
});

// --- computeFinalSpeed: config差し替え（データ更新で天候特性が追加可能なこと） ---

test("computeFinalSpeed: speedConfigは差し替え可能（新規天候特性データを追加できる）", () => {
  const customConfig = {
    ...CONFIG.speed,
    weatherAbilities: [...CONFIG.speed.weatherAbilities, { weather: "rain", abilityAliases: ["Drizzle"], label: "あめふらし", multiplier: 1 }],
  };
  const entry = { side: "ally", baseSpe: 100, item: null, ability: "Drizzle" };
  const { finalSpeed } = computeFinalSpeed(entry, { weather: "rain" }, customConfig);
  assert.equal(finalSpeed, 100); // multiplier 1のため変化なし・見つかること自体を確認
});

// --- collectSpeedEntries ---

test("collectSpeedEntries: 反映OFFの仮想敵構築は含まれない", () => {
  const team = { selectedBuildIds: [], poolBuildIds: [] };
  const enemyTeams = [
    {
      id: "e1",
      isReflected: false,
      pokemon: [{ speciesId: "pikachu", statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, nature: "がんばりや", item: null, ability: null }],
    },
  ];
  const { entries } = collectSpeedEntries({ team, teamBuilds: [], enemyTeams, pokedexById });
  assert.deepEqual(entries, []);
});

test("collectSpeedEntries: 反映ONの仮想敵構築のポケモンは含まれる", () => {
  const team = { selectedBuildIds: [], poolBuildIds: [] };
  const enemyTeams = [
    {
      id: "e1",
      isReflected: true,
      pokemon: [{ speciesId: "pikachu", species: "ピカチュウ", statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, nature: "がんばりや", item: null, ability: null }],
    },
  ];
  const { entries } = collectSpeedEntries({ team, teamBuilds: [], enemyTeams, pokedexById });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].side, "enemy");
  assert.equal(entries[0].sourceId, "e1:0");
});

test("collectSpeedEntries: 選択されていない候補プールのbuildは含まれない", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: ["b2"] };
  const teamBuilds = [
    { id: "b1", speciesId: "pikachu", nickname: null, nature: "がんばりや", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } },
    { id: "b2", speciesId: "kingdra", nickname: null, nature: "がんばりや", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } },
  ];
  const { entries } = collectSpeedEntries({ team, teamBuilds, selectedPoolIds: [], pokedexById });
  assert.deepEqual(entries.map((e) => e.sourceId), ["b1"]);
});

test("collectSpeedEntries: 選択された候補プールのbuildは含まれる", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: ["b2"] };
  const teamBuilds = [
    { id: "b1", speciesId: "pikachu", nickname: null, nature: "がんばりや", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } },
    { id: "b2", speciesId: "kingdra", nickname: null, nature: "がんばりや", item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } },
  ];
  const { entries } = collectSpeedEntries({ team, teamBuilds, selectedPoolIds: ["b2"], pokedexById });
  assert.deepEqual(entries.map((e) => e.sourceId).sort(), ["b1", "b2"]);
});

test("collectSpeedEntries: SP未入力のbuildはexcludedに理由付きで入る", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: [] };
  const teamBuilds = [{ id: "b1", speciesId: "pikachu", nickname: "エース", nature: "がんばりや", item: null, ability: null, statPoints: null }];
  const { entries, excluded } = collectSpeedEntries({ team, teamBuilds, pokedexById });
  assert.deepEqual(entries, []);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].side, "ally");
  assert.equal(excluded[0].label, "エース");
  assert.deepEqual(excluded[0].reasons, ["SP未入力"]);
});

test("collectSpeedEntries: speciesIdがpokedexに無いenemy pokemonはexcludedに入る", () => {
  const team = { selectedBuildIds: [], poolBuildIds: [] };
  const enemyTeams = [
    {
      id: "e1",
      isReflected: true,
      pokemon: [{ speciesId: "not-in-pokedex", species: "謎の生物", statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, nature: null, item: null, ability: null }],
    },
  ];
  const { entries, excluded } = collectSpeedEntries({ team, teamBuilds: [], enemyTeams, pokedexById });
  assert.deepEqual(entries, []);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].side, "enemy");
  assert.equal(excluded[0].label, "謎の生物");
  assert.deepEqual(excluded[0].reasons, ["種族データ不明"]);
});

test("collectSpeedEntries: nature未入力は除外されず中立補正(×1.0)で計算される", () => {
  const team = { selectedBuildIds: ["b1"], poolBuildIds: [] };
  const teamBuilds = [{ id: "b1", speciesId: "pikachu", nickname: null, nature: null, item: null, ability: null, statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }];
  const { entries, excluded } = collectSpeedEntries({ team, teamBuilds, pokedexById });
  assert.deepEqual(excluded, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].baseSpe, 120);
});

// --- groupBySpeed ---

test("groupBySpeed: finalSpeed降順に並ぶ", () => {
  const input = [
    { label: "遅い", finalSpeed: 100 },
    { label: "速い", finalSpeed: 200 },
  ];
  const groups = groupBySpeed(input);
  assert.deepEqual(groups.map((g) => g.speed), [200, 100]);
});

test("groupBySpeed: 同速2匹が同一グループになる", () => {
  const input = [
    { label: "A", finalSpeed: 150 },
    { label: "B", finalSpeed: 150 },
    { label: "C", finalSpeed: 100 },
  ];
  const groups = groupBySpeed(input);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].speed, 150);
  assert.deepEqual(groups[0].entries.map((e) => e.label).sort(), ["A", "B"]);
  assert.equal(groups[1].speed, 100);
  assert.deepEqual(groups[1].entries.map((e) => e.label), ["C"]);
});
