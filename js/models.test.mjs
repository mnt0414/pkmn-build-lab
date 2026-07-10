import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEvs, calcStat, calcAllStats } from "./models.js";

test("validateEvs: 合計510超過はエラー", () => {
  const result = validateEvs({ hp: 252, atk: 252, def: 7, spa: 0, spd: 0, spe: 0 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("510")));
});

test("validateEvs: 単体252超過はエラー", () => {
  const result = validateEvs({ hp: 253, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("hp")));
});

test("validateEvs: 正常系（合計510以下・各252以下）はvalid", () => {
  const result = validateEvs({ hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 2 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("calcStat: 種族値100・無補正・IV31・EV0・Lv50（HP以外）は120", () => {
  assert.equal(calcStat(100, 31, 0, 50, 1.0, false), 120);
});

test("calcStat: 種族値100・IV31・EV0・Lv50（HP）は175", () => {
  assert.equal(calcStat(100, 31, 0, 50, 1, true), 175);
});

test("calcStat: 種族値未投入(null)ならnullを返す", () => {
  assert.equal(calcStat(null, 31, 0), null);
});

test("calcAllStats: ようき（素早さ+・とくこう-）の性格補正が反映される", () => {
  const base = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
  const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const stats = calcAllStats(base, ivs, evs, "ようき", 50);
  assert.equal(stats.hp, 175);
  assert.equal(stats.atk, 120);
  assert.equal(stats.def, 120);
  assert.equal(stats.spd, 120);
  assert.equal(stats.spa, 108); // -補正: floor(120*0.9)
  assert.equal(stats.spe, 132); // +補正: floor(120*1.1)
});

test("calcAllStats: 種族値なしでも呼べてすべてnullを返す", () => {
  const stats = calcAllStats(null, { hp: 31 }, { hp: 0 }, "がんばりや", 50);
  assert.equal(stats.hp, null);
  assert.equal(stats.atk, null);
});
