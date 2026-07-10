import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveItem,
  sortTeams,
  nextSortOrder,
  countBuildsForTeam,
  cascadeDeleteTeamBuildIds,
  defaultFormatForNewTeam,
  placeBuildInTeam,
  removeBuildIdFromTeam,
} from "./party-logic.js";

test("moveItem: 先頭要素を末尾へ移動する", () => {
  const result = moveItem(["a", "b", "c"], 0, 2);
  assert.deepEqual(result, ["b", "c", "a"]);
});

test("moveItem: 隣接swap（末尾から1つ前へ）", () => {
  const result = moveItem(["a", "b", "c"], 2, 1);
  assert.deepEqual(result, ["a", "c", "b"]);
});

test("moveItem: fromIndexが範囲外なら無変更のコピーを返す", () => {
  const original = ["a", "b"];
  const result = moveItem(original, 5, 0);
  assert.deepEqual(result, ["a", "b"]);
  assert.notEqual(result, original); // 新しい配列であること
});

test("sortTeams: sortOrder昇順にソートする", () => {
  const teams = [
    { id: "b", sortOrder: 2, createdAt: "2026-01-02" },
    { id: "a", sortOrder: 1, createdAt: "2026-01-01" },
  ];
  const result = sortTeams(teams);
  assert.deepEqual(result.map((t) => t.id), ["a", "b"]);
});

test("sortTeams: sortOrder同値ならcreatedAt昇順で並べる", () => {
  const teams = [
    { id: "b", sortOrder: 1, createdAt: "2026-01-02" },
    { id: "a", sortOrder: 1, createdAt: "2026-01-01" },
  ];
  const result = sortTeams(teams);
  assert.deepEqual(result.map((t) => t.id), ["a", "b"]);
});

test("nextSortOrder: teamsが空なら0を返す", () => {
  assert.equal(nextSortOrder([]), 0);
});

test("nextSortOrder: 既存の最大値+1を返す", () => {
  const teams = [{ sortOrder: 3 }, { sortOrder: 7 }, { sortOrder: 1 }];
  assert.equal(nextSortOrder(teams), 8);
});

test("countBuildsForTeam: 指定teamIdの非アーカイブbuildのみ数える", () => {
  const builds = [
    { id: "1", teamId: "t1", archived: false },
    { id: "2", teamId: "t1", archived: true },
    { id: "3", teamId: "t2", archived: false },
  ];
  assert.equal(countBuildsForTeam(builds, "t1"), 1);
});

test("countBuildsForTeam: 該当buildが無ければ0", () => {
  assert.equal(countBuildsForTeam([], "t1"), 0);
});

test("cascadeDeleteTeamBuildIds: アーカイブ済み含め全idを返す", () => {
  const builds = [
    { id: "1", teamId: "t1", archived: false },
    { id: "2", teamId: "t1", archived: true },
    { id: "3", teamId: "t2", archived: false },
  ];
  assert.deepEqual(cascadeDeleteTeamBuildIds(builds, "t1"), ["1", "2"]);
});

test("cascadeDeleteTeamBuildIds: 該当buildが無ければ空配列", () => {
  assert.deepEqual(cascadeDeleteTeamBuildIds([], "t1"), []);
});

test("defaultFormatForNewTeam: teamsが空なら'single'", () => {
  assert.equal(defaultFormatForNewTeam([]), "single");
});

test("defaultFormatForNewTeam: 直近作成のbattleFormatを返す", () => {
  const teams = [
    { battleFormat: "single", createdAt: "2026-01-01T00:00:00.000Z" },
    { battleFormat: "double", createdAt: "2026-01-03T00:00:00.000Z" },
    { battleFormat: "single", createdAt: "2026-01-02T00:00:00.000Z" },
  ];
  assert.equal(defaultFormatForNewTeam(teams), "double");
});

test("placeBuildInTeam: 選出6匹未満ならmemberに追加する", () => {
  const team = { selectedBuildIds: ["a", "b"], poolBuildIds: [] };
  const result = placeBuildInTeam(team, "c");
  assert.equal(result.placement, "member");
  assert.deepEqual(result.team.selectedBuildIds, ["a", "b", "c"]);
  assert.deepEqual(result.team.poolBuildIds, []);
});

test("placeBuildInTeam: 選出6匹が埋まっていればpoolに追加する", () => {
  const team = { selectedBuildIds: ["a", "b", "c", "d", "e", "f"], poolBuildIds: ["x"] };
  const result = placeBuildInTeam(team, "g");
  assert.equal(result.placement, "pool");
  assert.deepEqual(result.team.selectedBuildIds, ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(result.team.poolBuildIds, ["x", "g"]);
});

test("placeBuildInTeam: 元のteamオブジェクトを変更しない", () => {
  const team = { selectedBuildIds: ["a"], poolBuildIds: [] };
  placeBuildInTeam(team, "b");
  assert.deepEqual(team.selectedBuildIds, ["a"]);
  assert.deepEqual(team.poolBuildIds, []);
});

test("placeBuildInTeam: 7匹追加すると6匹目までmember・7匹目はpoolになる", () => {
  let team = { selectedBuildIds: [], poolBuildIds: [] };
  const placements = [];
  for (let i = 1; i <= 7; i++) {
    const result = placeBuildInTeam(team, `p${i}`);
    placements.push(result.placement);
    team = result.team;
  }
  assert.deepEqual(placements, ["member", "member", "member", "member", "member", "member", "pool"]);
  assert.deepEqual(team.selectedBuildIds, ["p1", "p2", "p3", "p4", "p5", "p6"]);
  assert.deepEqual(team.poolBuildIds, ["p7"]);
});

test("removeBuildIdFromTeam: selectedBuildIdsから除去する", () => {
  const team = { selectedBuildIds: ["a", "b"], poolBuildIds: ["c"] };
  const result = removeBuildIdFromTeam(team, "a");
  assert.deepEqual(result.selectedBuildIds, ["b"]);
  assert.deepEqual(result.poolBuildIds, ["c"]);
});

test("removeBuildIdFromTeam: poolBuildIdsから除去する", () => {
  const team = { selectedBuildIds: ["a"], poolBuildIds: ["b", "c"] };
  const result = removeBuildIdFromTeam(team, "c");
  assert.deepEqual(result.selectedBuildIds, ["a"]);
  assert.deepEqual(result.poolBuildIds, ["b"]);
});

test("removeBuildIdFromTeam: 存在しないidを渡しても両配列とも無変化", () => {
  const team = { selectedBuildIds: ["a"], poolBuildIds: ["b"] };
  const result = removeBuildIdFromTeam(team, "z");
  assert.deepEqual(result.selectedBuildIds, ["a"]);
  assert.deepEqual(result.poolBuildIds, ["b"]);
});

test("removeBuildIdFromTeam: 元のteamオブジェクトを変更しない", () => {
  const team = { selectedBuildIds: ["a"], poolBuildIds: ["b"] };
  removeBuildIdFromTeam(team, "a");
  assert.deepEqual(team.selectedBuildIds, ["a"]);
  assert.deepEqual(team.poolBuildIds, ["b"]);
});
