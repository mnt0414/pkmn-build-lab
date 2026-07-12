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
  isMoveUnconfirmed,
  computeDuplicateWarnings,
  checkFormatLegality,
  computeEnemyMismatchWarnings,
  searchBuilds,
  deepCopyBuild,
  copyBuildIntoTeam,
  duplicateTeam,
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

test("isMoveUnconfirmed: learnset内の技はfalse", () => {
  assert.equal(isMoveUnconfirmed("tackle", ["tackle", "growl"]), false);
});

test("isMoveUnconfirmed: learnset外の技はtrue", () => {
  assert.equal(isMoveUnconfirmed("hyperbeam", ["tackle", "growl"]), true);
});

test("isMoveUnconfirmed: nullはfalse", () => {
  assert.equal(isMoveUnconfirmed(null, ["tackle"]), false);
});

test("isMoveUnconfirmed: 空文字はfalse", () => {
  assert.equal(isMoveUnconfirmed("", ["tackle"]), false);
});

test("isMoveUnconfirmed: learnsetIdsが空配列なら技ありはtrue", () => {
  assert.equal(isMoveUnconfirmed("tackle", []), true);
});

test("computeDuplicateWarnings: 選出6枠内で同じ種族が2件あれば種族重複警告を返す", () => {
  const team = { selectedBuildIds: ["a", "b"], poolBuildIds: [] };
  const builds = [
    { id: "a", speciesId: "pikachu", item: null },
    { id: "b", speciesId: "pikachu", item: null },
  ];
  const result = computeDuplicateWarnings(builds, team);
  assert.deepEqual(result, [{ type: "species", value: "pikachu", buildIds: ["a", "b"] }]);
});

test("computeDuplicateWarnings: 選出6枠内で同じ持ち物が2件あれば同一持ち物警告を返す", () => {
  const team = { selectedBuildIds: ["a", "b"], poolBuildIds: [] };
  const builds = [
    { id: "a", speciesId: "pikachu", item: "choice-scarf" },
    { id: "b", speciesId: "raichu", item: "choice-scarf" },
  ];
  const result = computeDuplicateWarnings(builds, team);
  assert.deepEqual(result, [{ type: "item", value: "choice-scarf", buildIds: ["a", "b"] }]);
});

test("computeDuplicateWarnings: 候補プール内の重複は警告しない(選出6枠外は対象外)", () => {
  const team = { selectedBuildIds: ["a"], poolBuildIds: ["b", "c"] };
  const builds = [
    { id: "a", speciesId: "pikachu", item: null },
    { id: "b", speciesId: "pikachu", item: "choice-scarf" },
    { id: "c", speciesId: "pikachu", item: "choice-scarf" },
  ];
  const result = computeDuplicateWarnings(builds, team);
  assert.deepEqual(result, []);
});

test("computeDuplicateWarnings: itemがnullのbuild同士は同一持ち物チェック対象外", () => {
  const team = { selectedBuildIds: ["a", "b"], poolBuildIds: [] };
  const builds = [
    { id: "a", speciesId: "pikachu", item: null },
    { id: "b", speciesId: "raichu", item: null },
  ];
  const result = computeDuplicateWarnings(builds, team);
  assert.deepEqual(result, []);
});

test("computeDuplicateWarnings: itemが空文字のbuild同士も同一持ち物チェック対象外", () => {
  const team = { selectedBuildIds: ["a", "b"], poolBuildIds: [] };
  const builds = [
    { id: "a", speciesId: "pikachu", item: "" },
    { id: "b", speciesId: "raichu", item: "" },
  ];
  const result = computeDuplicateWarnings(builds, team);
  assert.deepEqual(result, []);
});

test("computeDuplicateWarnings: 重複が無ければ空配列を返す", () => {
  const team = { selectedBuildIds: ["a", "b"], poolBuildIds: [] };
  const builds = [
    { id: "a", speciesId: "pikachu", item: "choice-scarf" },
    { id: "b", speciesId: "raichu", item: "life-orb" },
  ];
  const result = computeDuplicateWarnings(builds, team);
  assert.deepEqual(result, []);
});

test("checkFormatLegality: 常に空配列を返すスタブ", () => {
  assert.deepEqual(checkFormatLegality({}, {}), []);
});

test("computeEnemyMismatchWarnings: battleFormatが異なる仮想敵構築を抽出する", () => {
  const team = { battleFormat: "single", regulation: "" };
  const enemyTeams = [
    { id: "e1", name: "ダブル構築", battleFormat: "double", regulation: "" },
    { id: "e2", name: "シングル構築", battleFormat: "single", regulation: "" },
  ];
  const result = computeEnemyMismatchWarnings(enemyTeams, team);
  assert.deepEqual(result.map((t) => t.id), ["e1"]);
});

test("computeEnemyMismatchWarnings: regulationが両者に設定されていて異なる場合のみ抽出する", () => {
  const team = { battleFormat: "single", regulation: "レギュA" };
  const enemyTeams = [
    { id: "e1", battleFormat: "single", regulation: "レギュB" },
    { id: "e2", battleFormat: "single", regulation: "レギュA" },
    { id: "e3", battleFormat: "single", regulation: "" },
  ];
  const result = computeEnemyMismatchWarnings(enemyTeams, team);
  assert.deepEqual(result.map((t) => t.id), ["e1"]);
});

test("computeEnemyMismatchWarnings: 一致していれば空配列を返す", () => {
  const team = { battleFormat: "single", regulation: "レギュA" };
  const enemyTeams = [{ id: "e1", battleFormat: "single", regulation: "レギュA" }];
  assert.deepEqual(computeEnemyMismatchWarnings(enemyTeams, team), []);
});

const pokedexById = {
  pikachu: { name: "Pikachu", nameJa: "ピカチュウ" },
  raichu: { name: "Raichu", nameJa: "ライチュウ" },
};

test("searchBuilds: ニックネームの部分一致でヒットする", () => {
  const builds = [
    { id: "a", speciesId: "pikachu", nickname: "でんきネズミ", tags: [], archived: false },
    { id: "b", speciesId: "raichu", nickname: "らいちゅー", tags: [], archived: false },
  ];
  const result = searchBuilds(builds, pokedexById, "でんき");
  assert.deepEqual(result.map((b) => b.id), ["a"]);
});

test("searchBuilds: 種族名(nameJa)の部分一致でヒットする", () => {
  const builds = [
    { id: "a", speciesId: "pikachu", nickname: null, tags: [], archived: false },
    { id: "b", speciesId: "raichu", nickname: null, tags: [], archived: false },
  ];
  const result = searchBuilds(builds, pokedexById, "ライチュウ");
  assert.deepEqual(result.map((b) => b.id), ["b"]);
});

test("searchBuilds: タグの部分一致でヒットする", () => {
  const builds = [
    { id: "a", speciesId: "pikachu", nickname: null, tags: ["物理アタッカー"], archived: false },
    { id: "b", speciesId: "raichu", nickname: null, tags: ["特殊アタッカー"], archived: false },
  ];
  const result = searchBuilds(builds, pokedexById, "物理");
  assert.deepEqual(result.map((b) => b.id), ["a"]);
});

test("searchBuilds: 大文字小文字を区別しない", () => {
  const builds = [{ id: "a", speciesId: "pikachu", nickname: "PIKA", tags: [], archived: false }];
  const result = searchBuilds(builds, pokedexById, "pika");
  assert.deepEqual(result.map((b) => b.id), ["a"]);
});

test("searchBuilds: includeArchived=false(デフォルト)ならアーカイブ済みbuildは除外する", () => {
  const builds = [
    { id: "a", speciesId: "pikachu", nickname: null, tags: [], archived: true },
    { id: "b", speciesId: "pikachu", nickname: null, tags: [], archived: false },
  ];
  const result = searchBuilds(builds, pokedexById, "ピカチュウ");
  assert.deepEqual(result.map((b) => b.id), ["b"]);
});

test("searchBuilds: includeArchived=trueならアーカイブ済みbuildも含める", () => {
  const builds = [{ id: "a", speciesId: "pikachu", nickname: null, tags: [], archived: true }];
  const result = searchBuilds(builds, pokedexById, "ピカチュウ", { includeArchived: true });
  assert.deepEqual(result.map((b) => b.id), ["a"]);
});

test("searchBuilds: queryが空文字なら空配列を返す(全件表示はしない)", () => {
  const builds = [{ id: "a", speciesId: "pikachu", nickname: null, tags: [], archived: false }];
  assert.deepEqual(searchBuilds(builds, pokedexById, ""), []);
});

test("deepCopyBuild: 新しいIDを発行し、元オブジェクトと参照が異なる", () => {
  const source = {
    id: "src-1",
    teamId: "team-a",
    speciesId: "pikachu",
    moves: ["thunderbolt", null, null, null],
    tags: ["物理アタッカー"],
  };
  const clone = deepCopyBuild(source, "team-b");
  assert.notEqual(clone.id, source.id);
  assert.notEqual(clone, source);
  assert.notEqual(clone.moves, source.moves); // ネストしたオブジェクト/配列も独立コピー
  assert.deepEqual(clone.moves, source.moves);
});

test("deepCopyBuild: teamIdを付け替える", () => {
  const source = { id: "src-1", teamId: "team-a", speciesId: "pikachu" };
  const clone = deepCopyBuild(source, "team-b");
  assert.equal(clone.teamId, "team-b");
  assert.equal(source.teamId, "team-a"); // 元は変更されない
});

test("deepCopyBuild: コピー後にcloneを変更しても元buildへ影響しない", () => {
  const source = { id: "src-1", teamId: "team-a", speciesId: "pikachu", tags: ["a"] };
  const clone = deepCopyBuild(source, "team-b");
  clone.tags.push("b");
  clone.speciesId = "raichu";
  assert.deepEqual(source.tags, ["a"]);
  assert.equal(source.speciesId, "pikachu");
});

test("copyBuildIntoTeam: 選出6枠未満ならmemberへ配置する", () => {
  const source = { id: "src-1", teamId: "team-a", speciesId: "pikachu" };
  const targetTeam = { id: "team-b", selectedBuildIds: ["x"], poolBuildIds: [] };
  const { clone, updatedTeam, placement } = copyBuildIntoTeam(source, targetTeam);
  assert.equal(placement, "member");
  assert.deepEqual(updatedTeam.selectedBuildIds, ["x", clone.id]);
  assert.deepEqual(updatedTeam.poolBuildIds, []);
  assert.equal(clone.teamId, "team-b");
});

test("copyBuildIntoTeam: 選出6枠が埋まっていればpoolへ配置する", () => {
  const source = { id: "src-1", teamId: "team-a", speciesId: "pikachu" };
  const targetTeam = { id: "team-b", selectedBuildIds: ["a", "b", "c", "d", "e", "f"], poolBuildIds: [] };
  const { clone, updatedTeam, placement } = copyBuildIntoTeam(source, targetTeam);
  assert.equal(placement, "pool");
  assert.deepEqual(updatedTeam.selectedBuildIds, ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(updatedTeam.poolBuildIds, [clone.id]);
});

test("duplicateTeam: 新しいteam idを発行し、名前に「のコピー」を付与、archivedはfalseにリセットする", () => {
  const sourceTeam = {
    id: "team-a",
    name: "エースチーム",
    battleFormat: "single",
    regulation: "レギュレーションH",
    selectedBuildIds: ["b1", "b2"],
    poolBuildIds: ["b3"],
    speedCheckState: {},
    memo: "",
    archived: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const sourceBuilds = [
    { id: "b1", teamId: "team-a", speciesId: "pikachu" },
    { id: "b2", teamId: "team-a", speciesId: "raichu" },
    { id: "b3", teamId: "team-a", speciesId: "eevee" },
  ];
  const { newTeam, newBuilds } = duplicateTeam(sourceTeam, sourceBuilds, [sourceTeam]);

  assert.notEqual(newTeam.id, sourceTeam.id);
  assert.equal(newTeam.name, "エースチーム のコピー");
  assert.equal(newTeam.archived, false);
  assert.equal(newTeam.battleFormat, "single");
  assert.equal(newTeam.regulation, "レギュレーションH");
  assert.equal(newBuilds.length, 3);
});

test("duplicateTeam: 所属buildを全て新しいid・teamIdで複製し、内容(speciesId)は元と同じ", () => {
  const sourceTeam = { id: "team-a", name: "T", selectedBuildIds: ["b1"], poolBuildIds: ["b2"], sortOrder: 0 };
  const sourceBuilds = [
    { id: "b1", teamId: "team-a", speciesId: "pikachu" },
    { id: "b2", teamId: "team-a", speciesId: "raichu" },
  ];
  const { newTeam, newBuilds } = duplicateTeam(sourceTeam, sourceBuilds, [sourceTeam]);

  const originalIds = new Set(sourceBuilds.map((b) => b.id));
  for (const nb of newBuilds) {
    assert.equal(originalIds.has(nb.id), false);
    assert.equal(nb.teamId, newTeam.id);
  }
  assert.deepEqual(newBuilds.map((b) => b.speciesId).sort(), ["pikachu", "raichu"]);
});

test("duplicateTeam: selectedBuildIds/poolBuildIdsの並び順を保ったまま新build idに置き換える", () => {
  const sourceTeam = { id: "team-a", name: "T", selectedBuildIds: ["b1", "b2"], poolBuildIds: ["b3"], sortOrder: 0 };
  const sourceBuilds = [
    { id: "b1", teamId: "team-a", speciesId: "a" },
    { id: "b2", teamId: "team-a", speciesId: "b" },
    { id: "b3", teamId: "team-a", speciesId: "c" },
  ];
  const { newTeam, newBuilds } = duplicateTeam(sourceTeam, sourceBuilds, [sourceTeam]);

  const idToSpecies = new Map(newBuilds.map((b) => [b.id, b.speciesId]));
  assert.deepEqual(newTeam.selectedBuildIds.map((id) => idToSpecies.get(id)), ["a", "b"]);
  assert.deepEqual(newTeam.poolBuildIds.map((id) => idToSpecies.get(id)), ["c"]);
});

test("duplicateTeam: 元のteam・buildは変更されない(独立コピー)", () => {
  const sourceTeam = { id: "team-a", name: "T", selectedBuildIds: ["b1"], poolBuildIds: [], sortOrder: 0 };
  const sourceBuilds = [{ id: "b1", teamId: "team-a", speciesId: "pikachu", tags: ["a"] }];
  duplicateTeam(sourceTeam, sourceBuilds, [sourceTeam]);
  assert.deepEqual(sourceTeam.selectedBuildIds, ["b1"]);
  assert.equal(sourceBuilds[0].id, "b1");
  assert.deepEqual(sourceBuilds[0].tags, ["a"]);
});

test("duplicateTeam: sortOrderは既存team一覧のnextSortOrderに従う", () => {
  const sourceTeam = { id: "team-a", name: "T", selectedBuildIds: [], poolBuildIds: [], sortOrder: 3 };
  const otherTeam = { id: "team-b", sortOrder: 5 };
  const { newTeam } = duplicateTeam(sourceTeam, [], [sourceTeam, otherTeam]);
  assert.equal(newTeam.sortOrder, 6);
});
