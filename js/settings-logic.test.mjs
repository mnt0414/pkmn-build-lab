import { test } from "node:test";
import assert from "node:assert/strict";
import { groupArchivedItems } from "./settings-logic.js";

test("groupArchivedItems: 全て空配列なら全種別とも空配列を返す", () => {
  const result = groupArchivedItems([], [], []);
  assert.deepEqual(result, { builds: [], teams: [], enemyTeams: [] });
});

test("groupArchivedItems: archived===trueの項目のみ抽出する", () => {
  const builds = [
    { id: "b1", speciesId: "pikachu", nickname: null, archived: true },
    { id: "b2", speciesId: "raichu", nickname: null, archived: false },
  ];
  const result = groupArchivedItems(builds, [], []);
  assert.deepEqual(result.builds.map((b) => b.id), ["b1"]);
});

test("groupArchivedItems: archivedが未設定(undefined)の項目は除外する", () => {
  const teams = [{ id: "t1", name: "エースチーム" }];
  const result = groupArchivedItems([], teams, []);
  assert.deepEqual(result.teams, []);
});

test("groupArchivedItems: buildの表示名はnickname優先", () => {
  const builds = [{ id: "b1", speciesId: "pikachu", nickname: "でんきネズミ", archived: true }];
  const result = groupArchivedItems(builds, [], []);
  assert.deepEqual(result.builds, [{ id: "b1", type: "build", name: "でんきネズミ" }]);
});

test("groupArchivedItems: buildのnicknameが無ければspeciesIdにフォールバックする", () => {
  const builds = [{ id: "b1", speciesId: "pikachu", nickname: null, archived: true }];
  const result = groupArchivedItems(builds, [], []);
  assert.deepEqual(result.builds, [{ id: "b1", type: "build", name: "pikachu" }]);
});

test("groupArchivedItems: teamの表示名はname優先", () => {
  const teams = [{ id: "t1", name: "エースチーム", archived: true }];
  const result = groupArchivedItems([], teams, []);
  assert.deepEqual(result.teams, [{ id: "t1", type: "team", name: "エースチーム" }]);
});

test("groupArchivedItems: teamのnameが空文字なら'無題の構築'にフォールバックする", () => {
  const teams = [{ id: "t1", name: "", archived: true }];
  const result = groupArchivedItems([], teams, []);
  assert.deepEqual(result.teams, [{ id: "t1", type: "team", name: "無題の構築" }]);
});

test("groupArchivedItems: enemyTeamの表示名もname優先・無ければ'無題の構築'にフォールバックする", () => {
  const enemyTeams = [
    { id: "e1", name: "対策構築A", archived: true },
    { id: "e2", name: "", archived: true },
  ];
  const result = groupArchivedItems([], [], enemyTeams);
  assert.deepEqual(result.enemyTeams, [
    { id: "e1", type: "enemyTeam", name: "対策構築A" },
    { id: "e2", type: "enemyTeam", name: "無題の構築" },
  ]);
});

test("groupArchivedItems: 種別ごとに正しくグルーピングされ、他種別に混ざらない", () => {
  const builds = [{ id: "b1", speciesId: "pikachu", nickname: null, archived: true }];
  const teams = [{ id: "t1", name: "T", archived: true }];
  const enemyTeams = [{ id: "e1", name: "E", archived: true }];
  const result = groupArchivedItems(builds, teams, enemyTeams);
  assert.equal(result.builds.length, 1);
  assert.equal(result.teams.length, 1);
  assert.equal(result.enemyTeams.length, 1);
  assert.equal(result.builds[0].type, "build");
  assert.equal(result.teams[0].type, "team");
  assert.equal(result.enemyTeams[0].type, "enemyTeam");
});
