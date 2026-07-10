// 「＋ポケモンを追加」ダイアログ。「新規作成」（種族選択によるbuild新規作成）と
// 「呼び出し」（他構築で登録済みのbuildをタグ/ニックネーム/種族名で検索してディープコピー）の2タブ構成（Phase 3.6）。
import { createBuild } from "./models.js";
import { getAll, put } from "./db.js";
import { openSpeciesPicker } from "./species-picker.js";
import { getPokedex } from "./static-data.js";
import { placeBuildInTeam, searchBuilds, copyBuildIntoTeam } from "./party-logic.js";
import { escapeHtml } from "./utils.js";

const SEARCH_DEBOUNCE_MS = 200;

let dialogEl = null;

function ensureDialog() {
  if (!dialogEl) {
    dialogEl = document.createElement("dialog");
    dialogEl.className = "modal";
    document.body.appendChild(dialogEl);
  }
  return dialogEl;
}

function speciesDisplayName(speciesId, pokedex) {
  const entry = pokedex[speciesId];
  return entry ? entry.nameJa ?? entry.name : speciesId;
}

function searchResultRowHtml(build, pokedex, teamsById) {
  const speciesName = speciesDisplayName(build.speciesId, pokedex);
  const teamName = teamsById.get(build.teamId)?.name || "無題の構築";
  const tags = (build.tags ?? []).join(", ") || "なし";
  return `
    <div class="search-result-row" data-build-id="${escapeHtml(build.id)}">
      <div>${escapeHtml(speciesName)}${build.nickname ? ` (${escapeHtml(build.nickname)})` : ""}</div>
      <div class="search-result-row__meta">構築: ${escapeHtml(teamName)} ／ タグ: ${escapeHtml(tags)}</div>
    </div>
  `;
}

// team: 追加先の構築。onSaved({ team, build, placement }) を呼ぶ。
export function openPartyAddDialog({ team, onSaved }) {
  const dialog = ensureDialog();
  let selectedSpeciesId = null;
  let searchDebounceTimer = null;
  let buildsById = new Map(); // 呼び出しタブの検索結果表示用（クリック時のソースbuild引き当て）

  dialog.innerHTML = `
    <div class="modal-header">ポケモンを追加</div>
    <div class="dialog-tabs">
      <button type="button" class="dialog-tab is-active" id="tab-btn-create">新規作成</button>
      <button type="button" class="dialog-tab" id="tab-btn-search">呼び出し</button>
    </div>
    <div id="tab-content-create">
      <form method="dialog" novalidate>
        <div class="modal-body">
          <div class="field">
            <label>種族</label>
            <button type="button" class="btn" id="btn-pick-species">種族を検索して選択</button>
          </div>
          <div class="field">
            <label for="add-build-nickname">ニックネーム（任意）</label>
            <input class="input" id="add-build-nickname" type="text" maxlength="12" placeholder="未入力可">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="add-btn-cancel">キャンセル</button>
          <button type="submit" class="btn btn-primary" id="add-btn-save" disabled>追加</button>
        </div>
      </form>
    </div>
    <div id="tab-content-search" hidden>
      <div class="modal-body">
        <div class="field">
          <label for="build-search-input">タグ・ニックネーム・ポケモン名で検索</label>
          <input class="input search-box" id="build-search-input" type="text" placeholder="検索キーワードを入力" autocomplete="off">
        </div>
        <div id="search-results"><p class="placeholder">検索してください</p></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="btn-cancel-search">キャンセル</button>
      </div>
    </div>
  `;

  const tabBtnCreate = dialog.querySelector("#tab-btn-create");
  const tabBtnSearch = dialog.querySelector("#tab-btn-search");
  const tabContentCreate = dialog.querySelector("#tab-content-create");
  const tabContentSearch = dialog.querySelector("#tab-content-search");
  const pickBtn = dialog.querySelector("#btn-pick-species");
  const saveBtn = dialog.querySelector("#add-btn-save");
  const nicknameInput = dialog.querySelector("#add-build-nickname");
  const form = dialog.querySelector("form");
  const searchInput = dialog.querySelector("#build-search-input");
  const searchResultsEl = dialog.querySelector("#search-results");

  function switchTab(tab) {
    tabBtnCreate.classList.toggle("is-active", tab === "create");
    tabBtnSearch.classList.toggle("is-active", tab === "search");
    tabContentCreate.hidden = tab !== "create";
    tabContentSearch.hidden = tab !== "search";
  }

  tabBtnCreate.addEventListener("click", () => switchTab("create"));
  tabBtnSearch.addEventListener("click", () => switchTab("search"));

  dialog.querySelector("#add-btn-cancel").addEventListener("click", () => dialog.close());
  dialog.querySelector("#btn-cancel-search").addEventListener("click", () => dialog.close());

  pickBtn.addEventListener("click", async () => {
    const speciesId = await openSpeciesPicker();
    if (!speciesId) return;
    let label = speciesId;
    try {
      const pokedex = await getPokedex();
      const entry = pokedex[speciesId];
      if (entry) label = entry.nameJa ?? entry.name;
    } catch (err) {
      console.error("[party-add-dialog] 図鑑データ読込失敗", err);
    }
    selectedSpeciesId = speciesId;
    pickBtn.textContent = label; // textContentのためescapeHtml不要
    saveBtn.disabled = false;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedSpeciesId) return;
    const nickname = nicknameInput.value.trim();
    const build = createBuild({
      speciesId: selectedSpeciesId,
      teamId: team.id,
      nickname: nickname || null,
    });
    const { team: updatedTeam, placement } = placeBuildInTeam(team, build.id);
    const savedTeam = { ...updatedTeam, updatedAt: new Date().toISOString() };
    await put("builds", build);
    await put("teams", savedTeam);
    dialog.close();
    onSaved?.({ team: savedTeam, build, placement });
  });

  async function runSearch(query) {
    const q = query.trim();
    if (!q) {
      searchResultsEl.innerHTML = '<p class="placeholder">検索してください</p>';
      return;
    }
    try {
      const [allBuilds, allTeams, pokedex] = await Promise.all([getAll("builds"), getAll("teams"), getPokedex()]);
      const teamsById = new Map(allTeams.map((t) => [t.id, t]));
      const matched = searchBuilds(allBuilds, pokedex, q, { includeArchived: false }).filter(
        (b) => b.teamId !== team.id // 自分自身の構築内のbuildは呼び出し対象外
      );
      buildsById = new Map(matched.map((b) => [b.id, b]));
      if (matched.length === 0) {
        searchResultsEl.innerHTML = '<p class="placeholder">該当するポケモンが見つかりません</p>';
        return;
      }
      searchResultsEl.innerHTML = matched.map((b) => searchResultRowHtml(b, pokedex, teamsById)).join("");
    } catch (err) {
      console.error("[party-add-dialog] 呼び出し検索に失敗", err);
      searchResultsEl.innerHTML = '<p class="placeholder">検索に失敗しました</p>';
    }
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    const query = searchInput.value;
    searchDebounceTimer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
  });

  searchResultsEl.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-build-id]");
    if (!row) return;
    const sourceBuild = buildsById.get(row.dataset.buildId);
    if (!sourceBuild) return;
    const { clone, updatedTeam, placement } = copyBuildIntoTeam(sourceBuild, team);
    const savedTeam = { ...updatedTeam, updatedAt: new Date().toISOString() };
    await put("builds", clone);
    await put("teams", savedTeam);
    dialog.close();
    onSaved?.({ team: savedTeam, build: clone, placement });
  });

  switchTab("create");
  dialog.showModal();
}
