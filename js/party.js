// パーティ編成画面（構築=teamタブ基盤。Phase 3.2以降でbuild本体を実装）。
import { getAll, put } from "./db.js";
import { loadUiState, saveUiState } from "./ui-state.js";
import { escapeHtml } from "./utils.js";
import { sortTeams, moveItem, countBuildsForTeam } from "./party-logic.js";
import { openTeamModal } from "./party-team-modal.js";

function nonArchived(teams) {
  return teams.filter((t) => !t.archived);
}

function resolveSelectedTeamId(teams, savedId) {
  if (savedId && teams.some((t) => t.id === savedId)) return savedId;
  return teams[0]?.id ?? null;
}

async function persistReorder(teams, fromIndex, toIndex) {
  const reordered = moveItem(teams, fromIndex, toIndex);
  await Promise.all(
    reordered.map((t, i) => put("teams", { ...t, sortOrder: i, updatedAt: new Date().toISOString() }))
  );
}

export async function renderParty(el) {
  const [allTeams, builds] = await Promise.all([getAll("teams"), getAll("builds")]);
  const teams = sortTeams(nonArchived(allTeams));

  if (teams.length === 0) {
    el.innerHTML = `
      <section class="card empty-state">
        <p>まだ構築がありません</p>
        <button class="btn btn-primary" id="btn-create-first">最初の構築を作成</button>
      </section>
    `;
    el.querySelector("#btn-create-first").addEventListener("click", () => {
      openTeamModal({
        mode: "create",
        teams: allTeams,
        onSaved: (saved) => {
          saveUiState({ partyTeamId: saved.id });
          renderParty(el);
        },
      });
    });
    return;
  }

  const ui = loadUiState();
  const selectedId = resolveSelectedTeamId(teams, ui.partyTeamId);
  if (selectedId !== ui.partyTeamId) saveUiState({ partyTeamId: selectedId });
  const selectedTeam = teams.find((t) => t.id === selectedId);
  const selectedIndex = teams.findIndex((t) => t.id === selectedId);

  const tabsHtml = teams
    .map(
      (t) =>
        `<button class="tab ${t.id === selectedTeam.id ? "is-active" : ""}" data-team-id="${t.id}">${escapeHtml(t.name || "無題の構築")}</button>`
    )
    .join("");

  el.innerHTML = `
    <div class="tabs">
      ${tabsHtml}
      <button class="tab tab-add" id="btn-add-team" aria-label="新しい構築を作成">＋</button>
    </div>
    <div class="team-toolbar">
      <button class="btn btn-ghost" id="btn-move-left" ${selectedIndex <= 0 ? "disabled" : ""}>◀</button>
      <button class="btn btn-ghost" id="btn-move-right" ${selectedIndex >= teams.length - 1 ? "disabled" : ""}>▶</button>
      <button class="btn" id="btn-edit-team">編集</button>
    </div>
    <section class="card">
      <h2>選出6匹</h2>
      <p class="placeholder">${escapeHtml(selectedTeam.name || "無題の構築")}（${selectedTeam.battleFormat === "double" ? "ダブル" : "シングル"} / ${escapeHtml(selectedTeam.regulation || "未設定")}） ${selectedTeam.selectedBuildIds.length}/6匹選出</p>
      <p class="placeholder">TODO(Phase 3.2以降): build登録・タイプ・実数値（性格・ステータスポイント反映）・技4つ＋技タイプ表示</p>
    </section>
    <section class="card">
      <h2>候補ポケモン（${countBuildsForTeam(builds, selectedTeam.id)}件）</h2>
      <p class="placeholder">TODO(Phase 3.2以降): 検索（名前・ニックネーム・タグ）・アーカイブ・learnset技フィルタ</p>
    </section>
    <section class="card">
      <h2>素早さ比較</h2>
      <p class="placeholder">TODO(Phase 4): 仮想敵反映・スカーフ自動反映・おいかぜトグル・全選択／全解除</p>
    </section>
  `;

  el.querySelectorAll(".tab[data-team-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      saveUiState({ partyTeamId: btn.dataset.teamId });
      renderParty(el);
    });
  });

  el.querySelector("#btn-add-team").addEventListener("click", () => {
    openTeamModal({
      mode: "create",
      teams: allTeams,
      onSaved: (saved) => {
        saveUiState({ partyTeamId: saved.id });
        renderParty(el);
      },
    });
  });

  el.querySelector("#btn-edit-team").addEventListener("click", () => {
    openTeamModal({
      mode: "edit",
      team: selectedTeam,
      teams: allTeams,
      onSaved: () => renderParty(el),
      onDeleted: () => renderParty(el),
    });
  });

  el.querySelector("#btn-move-left").addEventListener("click", async () => {
    if (selectedIndex <= 0) return;
    await persistReorder(teams, selectedIndex, selectedIndex - 1);
    renderParty(el);
  });

  el.querySelector("#btn-move-right").addEventListener("click", async () => {
    if (selectedIndex >= teams.length - 1) return;
    await persistReorder(teams, selectedIndex, selectedIndex + 1);
    renderParty(el);
  });
}
