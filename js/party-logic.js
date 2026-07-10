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
