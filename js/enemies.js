// 仮想敵・メジャー構築画面（Phase 4.0: プリセット表示。Phase 4.1: ユーザー構築の登録・編集）
import { escapeHtml, safeHttpsUrl } from "./utils.js";
import { saveUiState } from "./ui-state.js";
import { put, del, setArchived } from "./db.js";
import { getPokedex } from "./static-data.js";
import { openEnemyTeamModal } from "./enemy-team-modal.js";
import { loadPresets, loadPresetOverrides, savePresetOverride, applyOverrides, loadUserTeams } from "./enemies-data.js";
import { showConfirmDialog } from "./confirm-dialog.js";

// 形式・レギュレーションフィルタ。プリセット・ユーザー構築どちらのteam配列にも使える共通関数。
export function filterEnemyTeams(teams, { battleFormat = "all", regulation = "all" } = {}) {
  return teams.filter((t) => {
    if (battleFormat !== "all" && t.battleFormat !== battleFormat) return false;
    if (regulation !== "all" && t.regulation !== regulation) return false;
    return true;
  });
}

export function collectRegulations(teams) {
  return Array.from(new Set(teams.map((t) => t.regulation).filter((r) => r))).sort();
}

function battleFormatJa(battleFormat) {
  return battleFormat === "double" ? "ダブル" : "シングル";
}

function speciesDisplayName(p, pokedex) {
  const entry = p.speciesId ? pokedex[p.speciesId] : null;
  if (entry?.nameJa) return entry.nameJa;
  if (p.species) return p.species;
  return p.speciesId ?? "";
}

// 仮想敵構築1件のポケモン一覧。ダメージ計算画面の「仮想敵から選ぶ」タブと同様、
// speciesId未設定のポケモンはダメージ計算に使えないため「ダメージ計算へ」ボタンを出さない。
function enemyPokemonListHtml(team, pokedex) {
  if (team.pokemon.length === 0) return '<p class="placeholder">未登録</p>';
  const rows = team.pokemon
    .map((p, idx) => {
      const name = escapeHtml(speciesDisplayName(p, pokedex));
      const calcBtn = p.speciesId
        ? `<button type="button" class="btn btn-ghost btn-calc-enemy" data-team-id="${escapeHtml(team.id)}" data-pokemon-index="${idx}">ダメージ計算へ</button>`
        : "";
      return `<div class="enemy-pokemon-row"><span>${name}</span>${calcBtn}</div>`;
    })
    .join("");
  return `<div class="enemy-pokemon-list">${rows}</div>`;
}

function enemyCardHtml(team, pokedex, { isUser = false } = {}) {
  const url = safeHttpsUrl(team.sourceUrl);
  const archivedBadge = isUser && team.archived ? '<span class="badge-muted">アーカイブ済み</span>' : "";
  return `
    <div class="enemy-card" data-team-id="${escapeHtml(team.id)}">
      <div class="pokemon-card__name">${escapeHtml(team.name || "無題の構築")}</div>
      <div class="enemy-card__badges">
        <span class="type-badge">${battleFormatJa(team.battleFormat)}</span>
        <span class="type-badge">${escapeHtml(team.regulation || "レギュ未設定")}</span>
        ${archivedBadge}
      </div>
      ${enemyPokemonListHtml(team, pokedex)}
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">出典記事</a>` : ""}
      <div class="enemy-card__actions">
        <button type="button" class="btn reflect-toggle ${team.isReflected ? "is-on" : ""}" data-toggle-id="${escapeHtml(team.id)}">
          他画面へ反映: ${team.isReflected ? "ON" : "OFF"}
        </button>
        ${
          isUser
            ? `
          <button type="button" class="btn btn-ghost" data-edit-id="${escapeHtml(team.id)}">編集</button>
          <button type="button" class="btn btn-ghost" data-archive-id="${escapeHtml(team.id)}">${team.archived ? "復元" : "アーカイブ"}</button>
          <button type="button" class="btn btn-danger" data-delete-id="${escapeHtml(team.id)}">完全削除</button>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function filterRowHtml(regulationOptions, filterState) {
  const regOptions = regulationOptions
    .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
    .join("");
  return `
    <div class="filter-row">
      <select class="select" id="filter-battle-format">
        <option value="all">形式: すべて</option>
        <option value="single">シングル</option>
        <option value="double">ダブル</option>
      </select>
      <select class="select" id="filter-regulation">
        <option value="all">レギュ: すべて</option>
        ${regOptions}
      </select>
    </div>
  `;
}

export async function renderEnemies(el) {
  const [presets, overrides, pokedex, userTeams] = await Promise.all([
    loadPresets(),
    loadPresetOverrides(),
    getPokedex(),
    loadUserTeams(),
  ]);
  let presetOverrides = overrides;
  let userTeamsState = userTeams;
  let filterState = { battleFormat: "all", regulation: "all" };
  let showArchived = false;

  async function refreshUserTeams() {
    userTeamsState = await loadUserTeams();
  }

  function draw() {
    const presetTeams = applyOverrides(presets, presetOverrides);
    const visibleUserTeams = showArchived ? userTeamsState : userTeamsState.filter((t) => !t.archived);
    const regulationOptions = collectRegulations([...presetTeams, ...userTeamsState]);

    const filteredPresets = filterEnemyTeams(presetTeams, filterState);
    const filteredUserTeams = filterEnemyTeams(visibleUserTeams, filterState);

    const presetCards = filteredPresets.map((t) => enemyCardHtml(t, pokedex)).join("");
    const userCards = filteredUserTeams.map((t) => enemyCardHtml(t, pokedex, { isUser: true })).join("");

    el.innerHTML = `
      <section class="card">
        <h2>メジャーな構築（プリセット）</h2>
        ${filterRowHtml(regulationOptions, filterState)}
        ${presetCards ? `<div class="enemy-list">${presetCards}</div>` : '<p class="placeholder">該当する構築がありません</p>'}
      </section>
      <section class="card">
        <h2>ユーザー構築</h2>
        <div class="team-toolbar">
          <button type="button" class="btn btn-primary" id="btn-add-user-team">＋仮想敵構築を追加</button>
          <label class="checkbox-label">
            <input type="checkbox" id="chk-show-archived" ${showArchived ? "checked" : ""}>
            アーカイブ済みを表示
          </label>
        </div>
        ${userCards ? `<div class="enemy-list">${userCards}</div>` : '<p class="placeholder">該当する構築がありません</p>'}
      </section>
    `;

    const formatSelect = el.querySelector("#filter-battle-format");
    const regulationSelect = el.querySelector("#filter-regulation");
    formatSelect.value = filterState.battleFormat;
    regulationSelect.value = filterState.regulation;

    formatSelect.addEventListener("change", (e) => {
      filterState = { ...filterState, battleFormat: e.target.value };
      draw();
    });
    regulationSelect.addEventListener("change", (e) => {
      filterState = { ...filterState, regulation: e.target.value };
      draw();
    });

    el.querySelector("#btn-add-user-team").addEventListener("click", () => {
      openEnemyTeamModal({
        mode: "create",
        onSaved: async () => {
          await refreshUserTeams();
          draw();
        },
      });
    });

    el.querySelector("#chk-show-archived").addEventListener("change", (e) => {
      showArchived = e.target.checked;
      draw();
    });

    // ダメージ計算画面へ、このポケモンを防御側の事前選択対象として渡す(Phase 5.3)。
    el.querySelectorAll(".btn-calc-enemy").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        saveUiState({
          calcPreselect: {
            side: "def",
            kind: "enemyPokemon",
            teamId: btn.dataset.teamId,
            pokemonIndex: Number(btn.dataset.pokemonIndex),
          },
        });
        document.querySelector('[data-page="calc"]').click();
      });
    });

    el.querySelectorAll(".reflect-toggle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.toggleId;
        const presetMatch = presetTeams.find((t) => t.id === id);
        if (presetMatch) {
          presetOverrides = await savePresetOverride(id, !presetMatch.isReflected);
          draw();
          return;
        }
        const userMatch = userTeamsState.find((t) => t.id === id);
        if (!userMatch) return;
        await put("enemyTeams", { ...userMatch, isReflected: !userMatch.isReflected, updatedAt: new Date().toISOString() });
        await refreshUserTeams();
        draw();
      });
    });

    el.querySelectorAll("[data-edit-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.editId;
        const team = userTeamsState.find((t) => t.id === id);
        if (!team) return;
        openEnemyTeamModal({
          mode: "edit",
          team,
          onSaved: async () => {
            await refreshUserTeams();
            draw();
          },
        });
      });
    });

    el.querySelectorAll("[data-archive-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.archiveId;
        const team = userTeamsState.find((t) => t.id === id);
        if (!team) return;
        await setArchived("enemyTeams", id, !team.archived);
        await refreshUserTeams();
        draw();
      });
    });

    el.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.deleteId;
        const ok = await showConfirmDialog({
          message: "この仮想敵構築を完全に削除します。よろしいですか？（元に戻せません）",
          danger: true,
        });
        if (!ok) return;
        await del("enemyTeams", id);
        await refreshUserTeams();
        draw();
      });
    });
  }

  draw();
}
