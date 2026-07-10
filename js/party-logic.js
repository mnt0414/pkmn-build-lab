// 構築(team)タブのDOM非依存な純粋関数群（並べ替え・ソート・連鎖削除対象抽出等）。

// 配列のfromIndex要素をtoIndexへ移動した新しい配列を返す（破壊しない）。範囲外は無変更のコピーを返す。
export function moveItem(array, fromIndex, toIndex) {
  const copy = [...array];
  if (fromIndex < 0 || fromIndex >= copy.length) return copy;
  const [item] = copy.splice(fromIndex, 1);
  const clampedTo = Math.max(0, Math.min(toIndex, copy.length));
  copy.splice(clampedTo, 0, item);
  return copy;
}

// sortOrder昇順、同値ならcreatedAt昇順でソートした新しい配列を返す。
export function sortTeams(teams) {
  return [...teams].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });
}

// 新規team作成時のsortOrder値（既存の最大値+1、空なら0）。
export function nextSortOrder(teams) {
  if (!teams || teams.length === 0) return 0;
  return Math.max(...teams.map((t) => t.sortOrder ?? 0)) + 1;
}

// 指定teamIdに所属する非アーカイブbuildの件数。
export function countBuildsForTeam(builds, teamId) {
  return builds.filter((b) => b.teamId === teamId && !b.archived).length;
}

// 指定teamIdに所属する全build（アーカイブ済み含む）のid一覧（完全削除時の連鎖削除対象）。
export function cascadeDeleteTeamBuildIds(builds, teamId) {
  return builds.filter((b) => b.teamId === teamId).map((b) => b.id);
}

// 新規team作成時の対戦形式初期値。直近作成(createdAt最大)のbattleFormatを返す。teamsが空なら"single"。
export function defaultFormatForNewTeam(teams) {
  if (!teams || teams.length === 0) return "single";
  const latest = teams.reduce((a, b) => ((a.createdAt ?? "") >= (b.createdAt ?? "") ? a : b));
  return latest.battleFormat ?? "single";
}

// 選出6匹(selectedBuildIds)に空きがあればmemberへ、埋まっていればpoolへ追加する。
// 破壊せず、新しいteamオブジェクトと配置結果("member"|"pool")を返す。
export function placeBuildInTeam(team, buildId) {
  if (team.selectedBuildIds.length < 6) {
    return {
      team: { ...team, selectedBuildIds: [...team.selectedBuildIds, buildId] },
      placement: "member",
    };
  }
  return {
    team: { ...team, poolBuildIds: [...team.poolBuildIds, buildId] },
    placement: "pool",
  };
}

// selectedBuildIds/poolBuildIds両方からbuildIdを除去した新しいteamオブジェクトを返す(存在しない方は無視)。
export function removeBuildIdFromTeam(team, buildId) {
  return {
    ...team,
    selectedBuildIds: team.selectedBuildIds.filter((id) => id !== buildId),
    poolBuildIds: team.poolBuildIds.filter((id) => id !== buildId),
  };
}

// moveIdがlearnsetIdsに含まれていなければtrue（「⚠ 習得データ未確認」表示の対象）。未設定(null/空文字)はfalse。
export function isMoveUnconfirmed(moveId, learnsetIds) {
  if (!moveId) return false;
  return !(learnsetIds ?? []).includes(moveId);
}

// team.selectedBuildIds(構築メンバー6枠)内のbuildのみを対象に、種族重複・同一持ち物を検出する。
// candidatePool(候補プール)は対象外(要件定義書3.1: プール内の重複登録は正常な運用のため警告しない)。
// 戻り値: [{ type: "species" | "item", value, buildIds: [...] }, ...]
export function computeDuplicateWarnings(builds, team) {
  const memberIds = new Set(team.selectedBuildIds ?? []);
  const memberBuilds = builds.filter((b) => memberIds.has(b.id));
  const warnings = [];

  const bySpecies = new Map();
  for (const b of memberBuilds) {
    if (!bySpecies.has(b.speciesId)) bySpecies.set(b.speciesId, []);
    bySpecies.get(b.speciesId).push(b.id);
  }
  for (const [speciesId, ids] of bySpecies) {
    if (ids.length > 1) warnings.push({ type: "species", value: speciesId, buildIds: ids });
  }

  const byItem = new Map();
  for (const b of memberBuilds) {
    if (!b.item) continue; // item未設定(null/空文字)はチェック対象外
    if (!byItem.has(b.item)) byItem.set(b.item, []);
    byItem.get(b.item).push(b.id);
  }
  for (const [item, ids] of byItem) {
    if (ids.length > 1) warnings.push({ type: "item", value: item, buildIds: ids });
  }

  return warnings;
}

// レギュレーション別の使用可否・制限枠数チェック。
// 現時点でルールデータ(Showdown由来の禁止リスト等)が存在しないため、常に空配列を返すスタブ。
// TODO: data/patches配下にレギュレーション別ルールデータが用意され次第実装する(要件定義書5章)。
export function checkFormatLegality(build, team) {
  return [];
}

// 過去の構築で登録した調整済みポケモン(build)をニックネーム・種族名(nameJa優先)・タグで検索する(OR条件・大文字小文字区別なし)。
// queryが空文字の場合は空配列を返す(全件表示はしない)。includeArchived=falseならアーカイブ済みbuildは除外する(3.6: 呼び出し検索のみの制約)。
export function searchBuilds(builds, pokedexById, query, { includeArchived = false } = {}) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return [];
  return builds.filter((b) => {
    if (!includeArchived && b.archived) return false;
    const entry = pokedexById[b.speciesId];
    const speciesName = entry ? entry.nameJa ?? entry.name : "";
    const nickname = b.nickname ?? "";
    const tags = b.tags ?? [];
    if (speciesName.toLowerCase().includes(q)) return true;
    if (nickname.toLowerCase().includes(q)) return true;
    return tags.some((t) => (t ?? "").toLowerCase().includes(q));
  });
}

// 他構築のbuildを完全に独立したコピーとして複製し、新IDを発行する。コピー後の編集は元のbuildへ影響しない。
export function deepCopyBuild(sourceBuild, targetTeamId) {
  const clone = structuredClone(sourceBuild);
  clone.id = crypto.randomUUID();
  clone.teamId = targetTeamId;
  clone.createdAt = clone.updatedAt = new Date().toISOString();
  return clone;
}

// deepCopyBuild + placeBuildInTeamのオーケストレーション。DB保存は行わない(呼び出し側でput("builds",clone)→put("teams",updatedTeam)を実行する)。
export function copyBuildIntoTeam(sourceBuild, targetTeam) {
  const clone = deepCopyBuild(sourceBuild, targetTeam.id);
  const { team: updatedTeam, placement } = placeBuildInTeam(targetTeam, clone.id);
  return { clone, updatedTeam, placement };
}
