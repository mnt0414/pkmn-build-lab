// 仮想敵・メジャー構築画面（Phase 4.0: プリセット表示。ユーザー構築はPhase 4.1で実装）
import { CONFIG } from "./config.js";
import { escapeHtml, safeHttpsUrl } from "./utils.js";
import { createEnemyTeam } from "./models.js";
import { get, put } from "./db.js";
import { getPokedex } from "./static-data.js";

const PRESET_OVERRIDES_KEY = "presetReflectedOverrides";

async function loadPresets() {
  let raw = [];
  try {
    const res = await fetch(CONFIG.presets.majorTeams);
    if (res.ok) raw = await res.json();
  } catch (err) {
    console.warn("[enemies] プリセット読込失敗（未配置なら正常）", err);
  }
  if (!Array.isArray(raw)) {
    console.warn("[enemies] プリセットJSONが配列ではありません");
    raw = [];
  }
  return raw.map((t) => createEnemyTeam(t));
}

// プリセットのisReflectedはユーザーのローカルoverrideを静的JSONの初期値より優先する。
// 静的JSON側は書き換えない（プリセット更新後もユーザーのON/OFFを保持するため）。
async function loadPresetOverrides() {
  const row = await get("meta", PRESET_OVERRIDES_KEY);
  return row?.overrides ?? {};
}

async function savePresetOverride(id, isReflected) {
  const row = await get("meta", PRESET_OVERRIDES_KEY);
  const overrides = { ...(row?.overrides ?? {}), [id]: isReflected };
  await put("meta", { key: PRESET_OVERRIDES_KEY, overrides });
  return overrides;
}

function applyOverrides(teams, overrides) {
  return teams.map((t) => (t.id in overrides ? { ...t, isReflected: overrides[t.id] } : t));
}

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

function enemyCardHtml(team, pokedex) {
  const names = team.pokemon.map((p) => escapeHtml(speciesDisplayName(p, pokedex))).join(" / ") || "未登録";
  const url = safeHttpsUrl(team.sourceUrl);
  return `
    <div class="enemy-card" data-team-id="${escapeHtml(team.id)}">
      <div class="pokemon-card__name">${escapeHtml(team.name || "無題の構築")}</div>
      <div class="enemy-card__badges">
        <span class="type-badge">${battleFormatJa(team.battleFormat)}</span>
        <span class="type-badge">${escapeHtml(team.regulation || "レギュ未設定")}</span>
      </div>
      <div class="placeholder">${names}</div>
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">出典記事</a>` : ""}
      <div>
        <button type="button" class="btn reflect-toggle ${team.isReflected ? "is-on" : ""}" data-toggle-id="${escapeHtml(team.id)}">
          他画面へ反映: ${team.isReflected ? "ON" : "OFF"}
        </button>
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
  const [presets, overrides, pokedex] = await Promise.all([loadPresets(), loadPresetOverrides(), getPokedex()]);
  let presetOverrides = overrides;
  let filterState = { battleFormat: "all", regulation: "all" };

  function draw() {
    const teams = applyOverrides(presets, presetOverrides);
    const regulationOptions = collectRegulations(teams);
    const filtered = filterEnemyTeams(teams, filterState);
    const cards = filtered.map((t) => enemyCardHtml(t, pokedex)).join("");

    el.innerHTML = `
      <section class="card">
        <h2>メジャーな構築（プリセット）</h2>
        ${filterRowHtml(regulationOptions, filterState)}
        ${cards ? `<div class="enemy-list">${cards}</div>` : '<p class="placeholder">該当する構築がありません</p>'}
      </section>
      <section class="card">
        <h2>ユーザー構築</h2>
        <p class="placeholder">TODO(Phase 4): 任意6匹の登録・「他画面へ反映」選択</p>
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

    el.querySelectorAll(".reflect-toggle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.toggleId;
        const current = teams.find((t) => t.id === id);
        if (!current) return;
        presetOverrides = await savePresetOverride(id, !current.isReflected);
        draw();
      });
    });
  }

  draw();
}
