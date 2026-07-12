import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStatPoints, calcStat, calcAllStats, createEnemyPokemon, createEnemyTeam } from "./models.js";

test("validateStatPoints: nullは未入力として許容", () => {
  const result = validateStatPoints(null);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateStatPoints: 正常系（各32以下・合計66以下）はvalid", () => {
  const result = validateStatPoints({ hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateStatPoints: 単体33超過はエラー", () => {
  const result = validateStatPoints({ hp: 33, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("hp")));
});

test("validateStatPoints: 合計67超過はエラー", () => {
  const result = validateStatPoints({ hp: 32, atk: 32, def: 3, spa: 0, spd: 0, spe: 0 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("66")));
});

test("calcStat: 種族値100・SP0・無補正（HP以外）は120", () => {
  assert.equal(calcStat(100, 0, 50, 1.0, false), 120);
});

test("calcStat: 種族値100・SP0（HP）は175", () => {
  assert.equal(calcStat(100, 0, 50, 1, true), 175);
});

test("calcStat: 種族値100・SP32・無補正（HP以外）は152", () => {
  assert.equal(calcStat(100, 32, 50, 1.0, false), 152);
});

test("calcStat: 種族値100・SP32（HP）は207", () => {
  assert.equal(calcStat(100, 32, 50, 1, true), 207);
});

test("calcStat: 種族値未投入(null)ならnullを返す", () => {
  assert.equal(calcStat(null, 0), null);
});

test("calcStat: statPoint未投入(null)ならnullを返す", () => {
  assert.equal(calcStat(100, null), null);
});

test("calcAllStats: ようき（素早さ+・とくこう-）の性格補正が反映される", () => {
  const base = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
  const statPoints = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const stats = calcAllStats(base, statPoints, "ようき", 50);
  assert.equal(stats.hp, 175);
  assert.equal(stats.atk, 120);
  assert.equal(stats.def, 120);
  assert.equal(stats.spd, 120);
  assert.equal(stats.spa, 108); // -補正: floor(120*0.9)
  assert.equal(stats.spe, 132); // +補正: floor(120*1.1)
});

test("calcAllStats: statPoints=nullなら全体nullを返す", () => {
  const base = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
  const stats = calcAllStats(base, null, "がんばりや", 50);
  assert.equal(stats, null);
});

test("createEnemyPokemon: 省略フィールドはnullに正規化される", () => {
  const p = createEnemyPokemon({});
  assert.equal(p.speciesId, null);
  assert.equal(p.species, null);
  assert.equal(p.ability, null);
  assert.equal(p.nature, null);
  assert.equal(p.item, null);
  assert.equal(p.statPoints, null);
  assert.deepEqual(p.moves, [null, null, null, null]);
});

test("createEnemyPokemon: movesが4要素未満の場合はnull埋めされる", () => {
  const p = createEnemyPokemon({ moves: ["でんこうせっか"] });
  assert.deepEqual(p.moves, ["でんこうせっか", null, null, null]);
});

test("createEnemyPokemon: movesが5件以上の場合は先頭4件のみ採用される", () => {
  const p = createEnemyPokemon({ moves: ["わざ1", "わざ2", "わざ3", "わざ4", "わざ5"] });
  assert.deepEqual(p.moves, ["わざ1", "わざ2", "わざ3", "わざ4"]);
});

test("createEnemyPokemon: speciesId/nature/statPoints等の指定値は保持される", () => {
  const p = createEnemyPokemon({
    speciesId: "floette",
    species: "フラエッテ",
    ability: "フラワーベール",
    nature: "ひかえめ",
    item: "こだわりメガネ",
    statPoints: { hp: 4, atk: 0, def: 0, spa: 32, spd: 0, spe: 30 },
  });
  assert.equal(p.speciesId, "floette");
  assert.equal(p.species, "フラエッテ");
  assert.equal(p.ability, "フラワーベール");
  assert.equal(p.nature, "ひかえめ");
  assert.equal(p.item, "こだわりメガネ");
  assert.deepEqual(p.statPoints, { hp: 4, atk: 0, def: 0, spa: 32, spd: 0, spe: 30 });
});

test("createEnemyTeam: isReflectedはデフォルトtrue", () => {
  const t = createEnemyTeam({});
  assert.equal(t.isReflected, true);
});

test("createEnemyTeam: partial.idが指定されていれば保持される", () => {
  const t = createEnemyTeam({ id: "preset-2026-pjcs-elfliza" });
  assert.equal(t.id, "preset-2026-pjcs-elfliza");
});

test("createEnemyTeam: pokemon配列の各要素がcreateEnemyPokemonで正規化される", () => {
  const t = createEnemyTeam({ pokemon: [{ speciesId: "floette", species: "フラエッテ" }] });
  assert.equal(t.pokemon.length, 1);
  assert.equal(t.pokemon[0].speciesId, "floette");
  assert.equal(t.pokemon[0].ability, null);
  assert.deepEqual(t.pokemon[0].moves, [null, null, null, null]);
});
