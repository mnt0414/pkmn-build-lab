// パーティ編成画面（構築=teamタブ基盤 + Phase 3.2: build登録・選出6匹/候補プール表示 + Phase 4.3: 素早さ比較）。
import { getAll, put, del, setArchived } from "./db.js";
import { loadUiState, saveUiState } from "./ui-state.js";
import { escapeHtml, safeHttpsUrl } from "./utils.js";
import {
  sortTeams,
  moveItem,
  countBuildsForTeam,
  removeBuildIdFromTeam,
  computeDuplicateWarnings,
  checkFormatLegality,
  computeEnemyMismatchWarnings,
} from "./party-logic.js";
import { collectSpeedEntries, computeFinalSpeed, groupBySpeed, normalizeSpeedCheckState } from "./speed-logic.js";
import { openTeamModal } from "./party-team-modal.js";
import { openPartyAddDialog } from "./party-add-dialog.js";
import { openBuildEditModal } from "./party-build-modal.js";
import { getPokedex } from "./static-data.js";
import { typeJa } from "./type-names.js";
import { calcAllStats } from "./models.js";
import { CONFIG } from "./config.js";
import { loadAllEnemyTeams } from "./enemies-data.js";

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
        <button type="button" class="btn btn-ghost btn-calc-build" data-build-id="${escapeHtml(build.id)}">ダメージ計算へ</button>
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

// ---- 素早さ比較（Phase 4.3） ----

function speedControlsHtml(speedState) {
  const weatherOptions = CONFIG.speed.weathers
    .map(
      (w) =>
        `<option value="${escapeHtml(w.id)}" ${speedState.weather === w.id ? "selected" : ""}>${escapeHtml(w.label)}</option>`
    )
    .join("");
  return `
    <div class="speed-controls">
      <div class="field">
        <label for="speed-weather">天候</label>
        <select class="select" id="speed-weather">${weatherOptions}</select>
      </div>
      <label class="checkbox-label"><input type="checkbox" id="speed-ally-tailwind" ${speedState.allyTailwind ? "checked" : ""}> 味方おいかぜ</label>
      <label class="checkbox-label"><input type="checkbox" id="speed-enemy-tailwind" ${speedState.enemyTailwind ? "checked" : ""}> 相手おいかぜ</label>
    </div>
  `;
}

function speedPoolSelectHtml(poolBuilds, selectedPoolIds, pokedex) {
  if (poolBuilds.length === 0) {
    return `<p class="placeholder">候補プールにポケモンがいません（比較に追加するポケモンは候補プールへ登録してください）</p>`;
  }
  const selectedSet = new Set(selectedPoolIds);
  const items = poolBuilds
    .map((b) => {
      const name = speciesDisplayName(b.speciesId, pokedex);
      const label = b.nickname ? `${name}（${escapeHtml(b.nickname)}）` : escapeHtml(name);
      return `<label class="checkbox-label"><input type="checkbox" class="speed-pool-chk" data-build-id="${escapeHtml(b.id)}" ${selectedSet.has(b.id) ? "checked" : ""}> ${label}</label>`;
    })
    .join("");
  return `
    <div class="speed-pool-select">
      <div class="team-toolbar">
        <button type="button" class="btn btn-ghost" id="speed-pool-select-all">全選択</button>
        <button type="button" class="btn btn-ghost" id="speed-pool-select-none">全解除</button>
      </div>
      <div class="tag-list">${items}</div>
    </div>
  `;
}

function mismatchWarningHtml(mismatched) {
  if (mismatched.length === 0) return "";
  const items = mismatched
    .map((t) => `<li>形式/レギュレーションが異なりますが反映しています: ${escapeHtml(t.name || "無題の構築")}</li>`)
    .join("");
  return `<div class="warning-banner">⚠ 仮想敵構築の一部は対戦形式/レギュレーションが現在の構築と異なりますが反映されています<ul>${items}</ul></div>`;
}

function speedEntryHtml(entry, pokedex) {
  const speciesEntry = entry.speciesId ? pokedex[entry.speciesId] : null;
  const spriteUrl = speciesEntry ? safeHttpsUrl(speciesEntry.spriteUrl) : null;
  const img = spriteUrl
    ? `<img class="speed-sprite" src="${escapeHtml(spriteUrl)}" alt="" onerror="this.style.display='none'">`
    : "";
  const sideLabel = entry.side === "ally" ? "味方" : "相手";
  const badges = entry.modifiers
    .map((m) => `<span class="modifier-badge">${escapeHtml(m.label)} ×${m.multiplier}</span>`)
    .join("");
  return `
    <span class="speed-entry speed-entry--${entry.side}">
      ${img}
      <span class="side-label side-label--${entry.side}">${sideLabel}</span>
      <span>${escapeHtml(entry.label)}</span>
      ${badges}
    </span>
  `;
}

function speedRowHtml(group, pokedex) {
  const entries = group.entries.map((e) => speedEntryHtml(e, pokedex)).join("");
  return `<div class="speed-row"><span class="speed-value">${group.speed}</span>${entries}</div>`;
}

function excludedSectionHtml(excluded, buildsById) {
  if (excluded.length === 0) return "";
  const items = excluded
    .map((ex) => {
      const sideLabel = ex.side === "ally" ? "味方" : "相手";
      const reasonsText = ex.reasons.join("・");
      const canEdit = ex.side === "ally" && buildsById.has(ex.sourceId);
      const editBtn = canEdit
        ? `<button type="button" class="btn btn-ghost btn-edit-excluded" data-build-id="${escapeHtml(ex.sourceId)}">編集</button>`
        : "";
      return `<li>[${sideLabel}] ${escapeHtml(ex.label)}: ${escapeHtml(reasonsText)} ${editBtn}</li>`;
    })
    .join("");
  return `
    <div class="excluded-section">
      <p class="placeholder">詳細未入力のため計算から除外されています</p>
      <ul>${items}</ul>
    </div>
  `;
}

function speedCardBodyHtml({ speedState, poolBuilds, mismatched, groups, excluded, buildsById, pokedex }) {
  const listHtml = groups.length
    ? groups.map((g) => speedRowHtml(g, pokedex)).join("")
    : `<p class="placeholder">比較対象のポケモンがいません</p>`;
  return `
    ${speedControlsHtml(speedState)}
    ${speedPoolSelectHtml(poolBuilds, speedState.selectedPoolIds, pokedex)}
    ${mismatchWarningHtml(mismatched)}
    <div class="speed-list">${listHtml}</div>
    ${excludedSectionHtml(excluded, buildsById)}
  `;
}

export async function renderParty(el) {
  const [allTeams, allBuilds, pokedex, enemyTeams] = await Promise.all([
    getAll("teams"),
    getAll("builds"),
    getPokedex(),
    loadAllEnemyTeams(),
  ]);
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

  const speedState = normalizeSpeedCheckState(selectedTeam);

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
      <div id="speed-card-body"></div>
    </section>
  `;

  // ---- 素早さ比較カード（Phase 4.3） ----
  const speedBodyEl = el.querySelector("#speed-card-body");
  let currentSpeedState = speedState;

  function drawSpeedCard() {
    const poolBuilds = selectedTeam.poolBuildIds.map((id) => buildsById.get(id)).filter(Boolean);
    const reflectedEnemyTeams = enemyTeams.filter((t) => t.isReflected);
    const mismatched = computeEnemyMismatchWarnings(reflectedEnemyTeams, selectedTeam);

    const { entries, excluded } = collectSpeedEntries({
      team: selectedTeam,
      teamBuilds,
      selectedPoolIds: currentSpeedState.selectedPoolIds,
      enemyTeams,
      pokedexById: pokedex,
    });
    const entriesWithSpeed = entries.map((entry) => {
      const { finalSpeed, modifiers } = computeFinalSpeed(entry, {
        weather: currentSpeedState.weather,
        allyTailwind: currentSpeedState.allyTailwind,
        enemyTailwind: currentSpeedState.enemyTailwind,
      });
      return { ...entry, finalSpeed, modifiers };
    });
    const groups = groupBySpeed(entriesWithSpeed);

    speedBodyEl.innerHTML = speedCardBodyHtml({
      speedState: currentSpeedState,
      poolBuilds,
      mismatched,
      groups,
      excluded,
      buildsById,
      pokedex,
    });

    speedBodyEl.querySelector("#speed-weather").addEventListener("change", (e) => {
      updateSpeedState({ weather: e.target.value });
    });
    speedBodyEl.querySelector("#speed-ally-tailwind").addEventListener("change", (e) => {
      updateSpeedState({ allyTailwind: e.target.checked });
    });
    speedBodyEl.querySelector("#speed-enemy-tailwind").addEventListener("change", (e) => {
      updateSpeedState({ enemyTailwind: e.target.checked });
    });

    const selectAllBtn = speedBodyEl.querySelector("#speed-pool-select-all");
    const selectNoneBtn = speedBodyEl.querySelector("#speed-pool-select-none");
    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", () => {
        updateSpeedState({ selectedPoolIds: poolBuilds.map((b) => b.id) });
      });
    }
    if (selectNoneBtn) {
      selectNoneBtn.addEventListener("click", () => {
        updateSpeedState({ selectedPoolIds: [] });
      });
    }
    speedBodyEl.querySelectorAll(".speed-pool-chk").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        const id = e.target.dataset.buildId;
        const next = e.target.checked
          ? [...currentSpeedState.selectedPoolIds, id]
          : currentSpeedState.selectedPoolIds.filter((x) => x !== id);
        updateSpeedState({ selectedPoolIds: next });
      });
    });

    speedBodyEl.querySelectorAll(".btn-edit-excluded").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const build = buildsById.get(btn.dataset.buildId);
        if (!build) return;
        const speciesData = pokedex[build.speciesId];
        const saved = await openBuildEditModal(build, speciesData);
        if (saved) renderParty(el); // SP入力等でstatsが変わるため全体を再取得して再描画する
      });
    });
  }

  async function updateSpeedState(patch) {
    currentSpeedState = { ...currentSpeedState, ...patch };
    await put("teams", { ...selectedTeam, speedCheckState: currentSpeedState, updatedAt: new Date().toISOString() });
    drawSpeedCard();
  }

  drawSpeedCard();

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

  // ダメージ計算画面へ、このポケモンを攻撃側の事前選択対象として渡す(Phase 5.3)。
  el.querySelectorAll(".btn-calc-build").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // カードクリック(build編集モーダル起動)への伝播を防ぐ
      saveUiState({ calcPreselect: { side: "atk", kind: "build", buildId: btn.dataset.buildId } });
      document.querySelector('[data-page="calc"]').click();
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
