import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStatPoints, calcStat, calcAllStats } from "./models.js";

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
