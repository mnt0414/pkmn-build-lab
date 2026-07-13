// 設定画面「データ管理」のDOM非依存な純粋関数群（アーカイブ済み項目の抽出・グルーピング）。

function buildDisplayName(build) {
  return build.nickname || build.speciesId || "";
}

function teamDisplayName(team) {
  return team.name || "無題の構築";
}

// builds/teams/enemyTeamsからarchived===trueの項目のみを抽出し、種別ごとにグルーピングして返す。
// 各項目は { id, type, name } の形（typeは"build"|"team"|"enemyTeam"）。
export function groupArchivedItems(builds, teams, enemyTeams) {
  return {
    builds: builds
      .filter((b) => b.archived === true)
      .map((b) => ({ id: b.id, type: "build", name: buildDisplayName(b) })),
    teams: teams
      .filter((t) => t.archived === true)
      .map((t) => ({ id: t.id, type: "team", name: teamDisplayName(t) })),
    enemyTeams: enemyTeams
      .filter((t) => t.archived === true)
      .map((t) => ({ id: t.id, type: "enemyTeam", name: teamDisplayName(t) })),
  };
}
