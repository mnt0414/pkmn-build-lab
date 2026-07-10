// パーティ編成画面（構築=teamタブ基盤 + Phase 3.2: build登録・選出6匹/候補プール表示）。
import { getAll, put, del, setArchived } from "./db.js";
import { loadUiState, saveUiState } from "./ui-state.js";
import { escapeHtml } from "./utils.js";
import {
  sortTeams,
  moveItem,
  countBuildsForTeam,
  removeBuildIdFromTeam,
  computeDuplicateWarnings,
  checkFormatLegality,
} from "./party-logic.js";
import { openTeamModal } from "./party-team-modal.js";
import { openPartyAddDialog } from "./party-add-dialog.js";
import { openBuildEditModal } from "./party-build-modal.js";
import { getPokedex } from "./static-data.js";
import { typeJa } from "./type-names.js";
import { calcAllStats } from "./models.js";

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

function displayTypes(entry) {
  if (!entry) return [];
  if (entry.typesJa) return entry.typesJa;
  return (entry.types ?? []).map(typeJa);
}

function statsLineHtml(stats) {
  if (!stats) return "実数値: 未設定";
  return `実数値: H${stats.hp} A${stats.atk} B${stats.def} C${stats.spa} D${stats.spd} S${stats.spe}`;
}

function movesLineHtml(moves) {
  const slots = (moves ?? [null, null, null, null]).map((m) => (m ? escapeHtml(m) : "未設定"));
  return `技: ${slots.join(" / ")}`;
}

function pokemonCardHtml(build, pokedex) {
  const entry = pokedex[build.speciesId];
  const name = entry ? entry.nameJa ?? entry.name : build.speciesId;
  const types = displayTypes(entry);
  const stats = calcAllStats(entry?.baseStats, build.statPoints, build.nature);
  return `
    <div class="pokemon-card" data-build-id="${escapeHtml(build.id)}">
      <div class="pokemon-card__name">${escapeHtml(name)}</div>
      ${build.nickname ? `<div class="placeholder">${escapeHtml(build.nickname)}</div>` : ""}
      <div class="pokemon-card__types">
        ${types.map((t) => `<span class="type-badge">${escapeHtml(t)}</span>`).join("")}
      </div>
      <div class="placeholder">${statsLineHtml(stats)}</div>
      <div class="placeholder">${movesLineHtml(build.moves)}</div>
      ${build.archived ? '<div><span class="badge-muted">アーカイブ済み</span></div>' : ""}
      <div class="pokemon-card__actions">
        <button type="button" class="btn btn-ghost btn-archive-build" data-build-id="${escapeHtml(build.id)}">${build.archived ? "復元" : "アーカイブ"}</button>
        <button type="button" class="btn btn-danger btn-delete-build" data-build-id="${escapeHtml(build.id)}">完全削除</button>
      </div>
    </div>
  `;
}

function memberSectionHtml(team, buildsById, pokedex) {
  const memberBuilds = team.selectedBuildIds.map((id) => buildsById.get(id)).filter(Boolean);
  const emptySlotCount = Math.max(0, 6 - memberBuilds.length);
  const cards = memberBuilds.map((b) => pokemonCardHtml(b, pokedex)).join("");
  const emptySlots = Array.from({ length: emptySlotCount })
    .map(() => `<button type="button" class="slot-empty btn-add-build">＋追加</button>`)
    .join("");
  return `<div class="grid">${cards}${emptySlots}</div>`;
}

function speciesDisplayName(speciesId, pokedex) {
  const entry = pokedex[speciesId];
  return entry ? entry.nameJa ?? entry.name : speciesId;
}

// 警告オブジェクト1件を日本語の理由文に変換する（対象ルール: 種族重複 / 同一持ち物）。
function duplicateWarningMessage(warning, pokedex) {
  if (warning.type === "species") {
    return `同じ種族が複数登録されています: ${speciesDisplayName(warning.value, pokedex)}`;
  }
  return `同じ持ち物が複数登録されています: ${warning.value}`;
}

function warningBannerHtml(warnings, pokedex) {
  if (warnings.length === 0) return "";
  const items = warnings.map((w) => `<li>${escapeHtml(duplicateWarningMessage(w, pokedex))}</li>`).join("");
  return `
    <div class="warning-banner">
      ⚠ 構築ルールに関する警告があります（登録・追加は拒否されません）
      <ul>${items}</ul>
    </div>
  `;
}

function poolSectionHtml(team, buildsById, pokedex) {
  const poolBuilds = team.poolBuildIds.map((id) => buildsById.get(id)).filter(Boolean);
  const cards = poolBuilds.map((b) => pokemonCardHtml(b, pokedex)).join("");
  return `<div class="grid">${cards}<button type="button" class="slot-empty btn-add-build">＋追加</button></div>`;
}

export async function renderParty(el) {
  const [allTeams, allBuilds, pokedex] = await Promise.all([getAll("teams"), getAll("builds"), getPokedex()]);
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

  const teamBuilds = allBuilds.filter((b) => b.teamId === selectedTeam.id);
  const buildsById = new Map(teamBuilds.map((b) => [b.id, b]));

  // 構築内自己整合性チェック(Phase 3.5): 選出6枠のみ対象、警告のみで登録・追加は拒否しない。
  // checkFormatLegalityは現時点でルールデータが無いため常に空配列を返すスタブ(要件定義書5章)。
  const warnings = [
    ...computeDuplicateWarnings(teamBuilds, selectedTeam),
    ...teamBuilds.flatMap((b) => checkFormatLegality(b, selectedTeam)),
  ];

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
      ${warningBannerHtml(warnings, pokedex)}
      <p class="placeholder">${escapeHtml(selectedTeam.name || "無題の構築")}（${selectedTeam.battleFormat === "double" ? "ダブル" : "シングル"} / ${escapeHtml(selectedTeam.regulation || "未設定")}） ${selectedTeam.selectedBuildIds.length}/6匹選出</p>
      ${memberSectionHtml(selectedTeam, buildsById, pokedex)}
    </section>
    <section class="card">
      <h2>候補ポケモン（${countBuildsForTeam(allBuilds, selectedTeam.id)}件）</h2>
      ${poolSectionHtml(selectedTeam, buildsById, pokedex)}
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
      onDuplicated: (newTeam) => {
        saveUiState({ partyTeamId: newTeam.id });
        renderParty(el);
      },
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

  el.querySelectorAll(".btn-add-build").forEach((btn) => {
    btn.addEventListener("click", () => {
      openPartyAddDialog({
        team: selectedTeam,
        onSaved: () => renderParty(el),
      });
    });
  });

  el.querySelectorAll(".btn-archive-build").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation(); // カードクリック(build編集モーダル起動)への伝播を防ぐ
      const build = buildsById.get(btn.dataset.buildId);
      if (!build) return;
      await setArchived("builds", build.id, !build.archived);
      renderParty(el);
    });
  });

  el.querySelectorAll(".btn-delete-build").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation(); // カードクリック(build編集モーダル起動)への伝播を防ぐ
      const build = buildsById.get(btn.dataset.buildId);
      if (!build) return;
      const ok = confirm("このポケモンを完全に削除します。この操作は取り消せません。よろしいですか？");
      if (!ok) return;
      const updatedTeam = removeBuildIdFromTeam(selectedTeam, build.id);
      await put("teams", { ...updatedTeam, updatedAt: new Date().toISOString() });
      await del("builds", build.id);
      renderParty(el);
    });
  });

  el.querySelectorAll(".pokemon-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const build = buildsById.get(card.dataset.buildId);
      if (!build) return;
      const speciesData = pokedex[build.speciesId];
      const saved = await openBuildEditModal(build, speciesData);
      if (saved) renderParty(el);
    });
  });
}
