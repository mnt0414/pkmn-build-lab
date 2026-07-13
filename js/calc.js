// ダメージ計算画面（Phase 5.2: UI本実装）。
// 攻撃側/防御側を「自分のパーティ」「仮想敵」「新種族」の3経路から選択し、calc-engine.jsのcalculateDamageで計算する。
// 注意: ダメ計のバグを修正した場合はBATTLEREC側にも反映すること（要件定義書3.2参照）。
import { get, getAll } from "./db.js";
import { loadUiState, saveUiState } from "./ui-state.js";
import { escapeHtml } from "./utils.js";
import { CONFIG } from "./config.js";
import { NATURES, STAT_KEYS, SP_MAX_PER_STAT, SP_MAX_TOTAL, validateStatPoints, calcAllStats } from "./models.js";
import { typeJa } from "./type-names.js";
import { getPokedex, getMoves, getLearnsets } from "./static-data.js";
import { loadAllEnemyTeams } from "./enemies-data.js";
import { openSpeciesPicker } from "./species-picker.js";
import { openBuildEditModal } from "./party-build-modal.js";
import { getOverlay, getNameJaLookup, calculateDamage } from "./calc-engine.js";

const STAT_LABELS = { hp: "HP", atk: "こうげき", def: "ぼうぎょ", spa: "とくこう", spd: "とくぼう", spe: "すばやさ" };
const HK_TO_STAT_KEY = { H: "hp", A: "atk", B: "def", C: "spa", D: "spd", S: "spe" };
const MOVE_SLOT_COUNT = 4;

// 地形はCONFIG側に既存の対応表がないため、calc-engine.jsのTERRAIN_ID_TO_EN命名規則(小文字英語id)に合わせてここで定義する。
const TERRAIN_OPTIONS = [
  { id: "none", label: "地形なし" },
  { id: "electric", label: "エレキフィールド" },
  { id: "grassy", label: "グラスフィールド" },
  { id: "misty", label: "ミストフィールド" },
  { id: "psychic", label: "サイコフィールド" },
];

let pickerDialogEl = null;

function ensurePickerDialog() {
  if (!pickerDialogEl) {
    pickerDialogEl = document.createElement("dialog");
    pickerDialogEl.className = "modal";
    document.body.appendChild(pickerDialogEl);
  }
  return pickerDialogEl;
}

function emptySide() {
  return {
    build: null,
    pokedexEntry: null,
    megaNameJa: null,
    moveId: null,
    sourceLabel: null,
    sourceFormat: null, // { battleFormat, regulation } | null（新種族はnull）
    canEdit: false,
    resolvedMoves: [],
  };
}

function displayTypes(entry) {
  if (!entry) return [];
  if (entry.typesJa) return entry.typesJa;
  return (entry.types ?? []).map(typeJa);
}

// champions_overlay.jsonのmegasキーは「メガ」「ゲンシ」+種族名(+X/Y/Z等の接尾辞)の命名規則になっている
// （overlay.jsonの実データで確認済み）。BATTLEREC側の判定ロジック(stripMega)と同じ考え方を踏襲する。
function stripMegaAffix(name) {
  return name.replace(/^(メガ|ゲンシ)/, "").replace(/[XYZ]$/, "");
}

function megaOptionsForSpecies(nameJa, overlay) {
  if (!nameJa || !overlay?.megas) return [];
  return Object.keys(overlay.megas).filter((m) => stripMegaAffix(m) === nameJa);
}

function convertMegaBaseStats(hkBaseStats) {
  const out = {};
  for (const [hk, key] of Object.entries(HK_TO_STAT_KEY)) out[key] = hkBaseStats[hk];
  return out;
}

// build.moves(4枠)には、自分のbuild由来の英語moveId・自由入力文字列(未確認技)、
// 仮想敵pokemon由来の日本語自由入力技名が混在しうる。既にmovesData(id)にヒットすればそのまま、
// しなければnameJaLookupの技逆引きで英語moveIdへの変換を試みる（resolveAbilityForEngineと同じ考え方）。
// 変換できなければ元の文字列のまま返し、計算実行時にcalc-engine側の「技データが見つかりません」エラーに委ねる。
function computeResolvedMoves(build, movesData, nameJaLookup) {
  const raw = (build?.moves ?? []).filter(Boolean);
  return raw.map((text) => {
    const moveId = movesData[text] ? text : (nameJaLookup.moves.get(text) ?? text);
    const data = movesData[moveId];
    const label = data ? `${data.nameJa ?? data.name}（${typeJa(data.type)}）` : `${text}（技データ不明）`;
    return { raw: text, moveId, label, type: data?.type, basePower: data?.basePower };
  });
}

function koRangeText(result) {
  if (result.maxDamage <= 0) return "効果なし";
  if (result.minHitsToKo === result.maxHitsToKo) return `確定${result.minHitsToKo}発`;
  return `${result.minHitsToKo}〜${result.maxHitsToKo}発`;
}

// 攻撃側/防御側の選択元(team/仮想敵構築)のbattleFormat/regulationが、現在のフィールド設定(対戦形式)
// または相手側と異なる場合の警告メッセージ一覧を作る（要件定義書3.2「形式・レギュレーション不一致」）。
// 反映(計算)自体はブロックしない。
function mismatchWarnings(atkSide, defSide, fieldState) {
  const warnings = [];
  const gameTypeJa = fieldState.gameType === "double" ? "ダブル" : "シングル";
  for (const [side, label] of [[atkSide, "攻撃側"], [defSide, "防御側"]]) {
    if (!side.sourceFormat) continue;
    if (side.sourceFormat.battleFormat !== fieldState.gameType) {
      const fmtJa = side.sourceFormat.battleFormat === "double" ? "ダブル" : "シングル";
      warnings.push(`${label}(${side.sourceLabel})は${fmtJa}の構築ですが、現在の計算設定は${gameTypeJa}です`);
    }
  }
  if (
    atkSide.sourceFormat?.regulation &&
    defSide.sourceFormat?.regulation &&
    atkSide.sourceFormat.regulation !== defSide.sourceFormat.regulation
  ) {
    warnings.push(
      `攻撃側と防御側でレギュレーションが異なります（${atkSide.sourceFormat.regulation} / ${defSide.sourceFormat.regulation}）`
    );
  }
  return warnings;
}

function warningBannerHtml(messages) {
  if (messages.length === 0) return "";
  const items = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
  return `
    <div class="warning-banner">
      ⚠ 形式・レギュレーションに関する警告があります（計算は継続されます）
      <ul>${items}</ul>
    </div>
  `;
}

function statsGridHtml(stats) {
  return `<div class="stat-grid">${STAT_KEYS.map((key) => `<div>${STAT_LABELS[key]}: ${stats[key]}</div>`).join("")}</div>`;
}

function attackerMoveSelectHtml(side) {
  if (side.resolvedMoves.length === 0) {
    return `<p class="placeholder">選択可能な技がありません</p>`;
  }
  const options = [
    '<option value="">技を選択</option>',
    ...side.resolvedMoves.map(
      (m) => `<option value="${escapeHtml(m.moveId)}" ${side.moveId === m.moveId ? "selected" : ""}>${escapeHtml(m.label)}</option>`
    ),
  ].join("");
  return `
    <div class="field">
      <label for="calc-atk-move">使用技</label>
      <select class="select" id="calc-atk-move">${options}</select>
    </div>
  `;
}

function sideCardHtml(side, sideKey, sideLabel, pokedex, overlay) {
  if (!side.build) {
    return `
      <div class="calc-side">
        <div class="pokemon-card__name">${escapeHtml(sideLabel)}</div>
        <p class="placeholder">未選択</p>
        <button type="button" class="btn btn-primary calc-btn-pick" data-side="${sideKey}">選択</button>
      </div>
    `;
  }

  const entry = side.pokedexEntry;
  const speciesName = entry ? entry.nameJa ?? entry.name : side.build.speciesId ?? "不明";
  const megaOptions = entry ? megaOptionsForSpecies(entry.nameJa ?? entry.name, overlay) : [];
  const megaInfo = side.megaNameJa ? overlay?.megas?.[side.megaNameJa] : null;
  const types = megaInfo?.types ?? displayTypes(entry);
  const baseStatsForPreview = megaInfo ? convertMegaBaseStats(megaInfo.baseStats) : entry?.baseStats;
  const stats = side.build.statPoints ? calcAllStats(baseStatsForPreview, side.build.statPoints, side.build.nature) : null;

  const megaSelectHtml = megaOptions.length
    ? `
      <div class="field">
        <label for="calc-${sideKey}-mega">メガシンカ</label>
        <select class="select calc-mega-select" id="calc-${sideKey}-mega" data-side="${sideKey}">
          <option value="">通常</option>
          ${megaOptions
            .map((m) => `<option value="${escapeHtml(m)}" ${side.megaNameJa === m ? "selected" : ""}>${escapeHtml(m)}</option>`)
            .join("")}
        </select>
      </div>`
    : "";

  const statWarningHtml = !side.build.statPoints
    ? `
      <div class="field-error">⚠ ステータスポイント未入力のため、このポケモンは計算から除外されます</div>
      ${side.canEdit ? `<button type="button" class="btn btn-ghost calc-btn-edit" data-side="${sideKey}">編集して入力する</button>` : ""}
    `
    : "";

  return `
    <div class="calc-side">
      <div class="pokemon-card__name">${escapeHtml(sideLabel)}: ${escapeHtml(speciesName)}</div>
      <p class="placeholder">${escapeHtml(side.sourceLabel ?? "")}</p>
      <div class="pokemon-card__types">${types.map((t) => `<span class="type-badge">${escapeHtml(t)}</span>`).join("")}</div>
      ${stats ? statsGridHtml(stats) : '<p class="placeholder">実数値: 未設定</p>'}
      ${statWarningHtml}
      ${megaSelectHtml}
      ${sideKey === "atk" ? attackerMoveSelectHtml(side) : ""}
      <button type="button" class="btn btn-ghost calc-btn-pick" data-side="${sideKey}">選び直す</button>
    </div>
  `;
}

function fieldControlsHtml(fieldState) {
  const weatherOptions = CONFIG.speed.weathers
    .map((w) => `<option value="${escapeHtml(w.id)}" ${fieldState.weather === w.id ? "selected" : ""}>${escapeHtml(w.label)}</option>`)
    .join("");
  const terrainOptions = TERRAIN_OPTIONS.map(
    (t) => `<option value="${escapeHtml(t.id)}" ${fieldState.terrain === t.id ? "selected" : ""}>${escapeHtml(t.label)}</option>`
  ).join("");
  return `
    <div class="speed-controls">
      <div class="field">
        <label for="calc-field-gametype">対戦形式</label>
        <select class="select" id="calc-field-gametype">
          <option value="single" ${fieldState.gameType === "single" ? "selected" : ""}>シングル</option>
          <option value="double" ${fieldState.gameType === "double" ? "selected" : ""}>ダブル</option>
        </select>
      </div>
      <div class="field">
        <label for="calc-field-weather">天候</label>
        <select class="select" id="calc-field-weather">${weatherOptions}</select>
      </div>
      <div class="field">
        <label for="calc-field-terrain">地形</label>
        <select class="select" id="calc-field-terrain">${terrainOptions}</select>
      </div>
      <label class="checkbox-label"><input type="checkbox" id="calc-field-reflect" ${fieldState.reflect ? "checked" : ""}> リフレクター</label>
      <label class="checkbox-label"><input type="checkbox" id="calc-field-lightscreen" ${fieldState.lightScreen ? "checked" : ""}> ひかりのかべ</label>
      <label class="checkbox-label"><input type="checkbox" id="calc-field-helpinghand" ${fieldState.helpingHand ? "checked" : ""}> てだすけ</label>
      <label class="checkbox-label"><input type="checkbox" id="calc-field-crit" ${fieldState.isCrit ? "checked" : ""}> 急所</label>
    </div>
  `;
}

function resultHtml(result, errorMessage) {
  if (errorMessage) {
    return `<div class="field-error">${escapeHtml(errorMessage)}</div>`;
  }
  if (!result) {
    return `<p class="placeholder">攻撃側・防御側・使用技を選択し、計算ボタンを押してください</p>`;
  }
  if (result.error) {
    return `<div class="field-error">${escapeHtml(result.error)}</div>`;
  }
  const minPercentClamped = Math.min(100, result.minPercent);
  const maxPercentClamped = Math.min(100, result.maxPercent);
  const notesHtml = result.notes.length
    ? `<div class="excluded-section"><p class="placeholder">補正・注記</p><ul>${result.notes
        .map((n) => `<li>${escapeHtml(n)}</li>`)
        .join("")}</ul></div>`
    : "";
  return `
    <div class="calc-result">
      <div>ダメージ: ${result.minDamage}〜${result.maxDamage}（防御側HP ${result.defenderHp}中）</div>
      <div>割合: ${result.minPercent}%〜${result.maxPercent}%</div>
      <div>確定数の目安: ${koRangeText(result)}</div>
      <div class="calc-result-bar">
        <div class="calc-result-bar__min" style="width:${minPercentClamped}%"></div>
        <div class="calc-result-bar__range" style="left:${minPercentClamped}%;width:${Math.max(0, maxPercentClamped - minPercentClamped)}%"></div>
      </div>
      ${result.description ? `<p class="placeholder">${escapeHtml(result.description)}</p>` : ""}
      ${notesHtml}
    </div>
  `;
}

// ---- 選択ダイアログ（自分のパーティから/仮想敵から/新種族から） ----

function partyCandidateHtml(build, teamsById, pokedex) {
  const entry = pokedex[build.speciesId];
  const name = entry ? entry.nameJa ?? entry.name : build.speciesId;
  const teamName = teamsById.get(build.teamId)?.name || "無題の構築";
  const spWarn = !build.statPoints ? '<span class="badge-warning">⚠ SP未入力</span>' : "";
  return `
    <div class="pokemon-card" data-build-id="${escapeHtml(build.id)}">
      <div class="pokemon-card__name">${escapeHtml(name)}${build.nickname ? `（${escapeHtml(build.nickname)}）` : ""}</div>
      <p class="placeholder">${escapeHtml(teamName)}</p>
      ${spWarn}
    </div>
  `;
}

function enemyCandidateHtml(row, pokedex) {
  const entry = pokedex[row.pokemon.speciesId];
  const name = entry ? entry.nameJa ?? entry.name : row.pokemon.species ?? row.pokemon.speciesId;
  const spWarn = !row.pokemon.statPoints ? '<span class="badge-warning">⚠ SP未入力</span>' : "";
  return `
    <div class="pokemon-card" data-row-key="${escapeHtml(row.key)}">
      <div class="pokemon-card__name">${escapeHtml(name)}</div>
      <p class="placeholder">${escapeHtml(row.team.name || "無題の構築")}</p>
      ${spWarn}
    </div>
  `;
}

function abilityOptionsForSpecies(entry, selected) {
  const slots = ["0", "1", "H"];
  const seen = new Set();
  const options = ['<option value="">未設定</option>'];
  for (const slot of slots) {
    const en = entry?.abilities?.[slot];
    if (!en || seen.has(en)) continue;
    seen.add(en);
    const ja = entry?.abilitiesJa?.[slot] ?? en;
    options.push(`<option value="${escapeHtml(en)}" ${selected === en ? "selected" : ""}>${escapeHtml(ja)}</option>`);
  }
  return options.join("");
}

function natureOptionsForForm(selected) {
  const options = ['<option value="">未設定</option>'];
  for (const name of Object.keys(NATURES)) {
    options.push(`<option value="${escapeHtml(name)}" ${selected === name ? "selected" : ""}>${escapeHtml(name)}</option>`);
  }
  return options.join("");
}

function moveOptionsForSlot(learnsetIds, movesData, selected) {
  const options = ['<option value="">未設定</option>'];
  for (const moveId of learnsetIds) {
    const m = movesData[moveId];
    const label = m ? `${m.nameJa ?? m.name}（${typeJa(m.type)}）` : moveId;
    options.push(`<option value="${escapeHtml(moveId)}" ${selected === moveId ? "selected" : ""}>${escapeHtml(label)}</option>`);
  }
  return options.join("");
}

function newSpeciesFormHtml(entry, speciesId, learnsets, movesData) {
  const learnsetIds = learnsets[speciesId] ?? [];
  const spInputs = STAT_KEYS.map(
    (key) => `
      <div class="field">
        <label for="calc-new-sp-${key}">${STAT_LABELS[key]}</label>
        <input class="input" id="calc-new-sp-${key}" type="number" inputmode="numeric" min="0" max="${SP_MAX_PER_STAT}" step="1">
      </div>`
  ).join("");
  const moveSelects = Array.from(
    { length: MOVE_SLOT_COUNT },
    (_, i) => `<select class="select calc-new-move-select" data-slot="${i}">${moveOptionsForSlot(learnsetIds, movesData, null)}</select>`
  ).join("");
  return `
    <div class="field">
      <label for="calc-new-ability">特性（任意）</label>
      <select class="select" id="calc-new-ability">${abilityOptionsForSpecies(entry, null)}</select>
    </div>
    <div class="field">
      <label for="calc-new-nature">性格（任意）</label>
      <select class="select" id="calc-new-nature">${natureOptionsForForm(null)}</select>
    </div>
    <div class="field">
      <label for="calc-new-item">持ち物（任意）</label>
      <input class="input" id="calc-new-item" type="text" placeholder="未入力可">
    </div>
    <div class="field">
      <label>ステータスポイント（各0〜${SP_MAX_PER_STAT}・合計0〜${SP_MAX_TOTAL}・未入力可。未入力の場合は計算から除外されます）</label>
      <div class="sp-input-grid">${spInputs}</div>
      <div id="calc-new-sp-errors"></div>
    </div>
    <div class="field">
      <label>技（任意・最大4・習得技一覧から選択）</label>
      ${moveSelects}
    </div>
    <button type="button" class="btn btn-primary" id="calc-new-confirm">この内容で決定</button>
  `;
}

// build+team から選択結果オブジェクトを組み立てる（自分のパーティ経路）。
// openCalcPickerの「自分のパーティから」タブと、Phase5.3のパーティ画面からの直接遷移(事前選択)の
// 両方から呼ばれる共通ロジック（二重実装防止）。
function buildPartySideFromTeam(build, team, pokedex) {
  return {
    build,
    pokedexEntry: pokedex[build.speciesId],
    sourceLabel: `自分のパーティ: ${team?.name || "無題の構築"}`,
    sourceFormat: team ? { battleFormat: team.battleFormat, regulation: team.regulation } : null,
    canEdit: true,
  };
}

// 仮想敵pokemon+team から選択結果オブジェクトを組み立てる（仮想敵経路）。
// openCalcPickerの「仮想敵から」タブと、Phase5.3の仮想敵画面からの直接遷移(事前選択)の
// 両方から呼ばれる共通ロジック（二重実装防止）。
function buildEnemySideFromTeam(pokemon, team, pokedex) {
  return {
    build: pokemon,
    pokedexEntry: pokedex[pokemon.speciesId],
    sourceLabel: `仮想敵: ${team.name || "無題の構築"}`,
    sourceFormat: { battleFormat: team.battleFormat, regulation: team.regulation },
    canEdit: false,
  };
}

// 選択ダイアログを開く。resolve({build,pokedexEntry,sourceLabel,sourceFormat,canEdit}) または キャンセル時null。
function openCalcPicker({ pokedex, movesData, learnsets }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const dialog = ensurePickerDialog();
    dialog.innerHTML = `
      <div class="modal-header">計算対象のポケモンを選択</div>
      <div class="dialog-tabs">
        <button type="button" class="dialog-tab is-active" data-tab="party">自分のパーティから</button>
        <button type="button" class="dialog-tab" data-tab="enemy">仮想敵から</button>
        <button type="button" class="dialog-tab" data-tab="new">新種族から</button>
      </div>
      <div class="modal-body" id="calc-picker-body"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="calc-picker-cancel">キャンセル</button>
      </div>
    `;

    const bodyEl = dialog.querySelector("#calc-picker-body");
    const tabs = dialog.querySelectorAll(".dialog-tab");

    async function drawPartyTab() {
      bodyEl.innerHTML = '<p class="placeholder">読込中...</p>';
      const [allTeams, allBuilds] = await Promise.all([getAll("teams"), getAll("builds")]);
      const teamsById = new Map(allTeams.map((t) => [t.id, t]));
      const ui = loadUiState();
      const scopedTeam = ui.partyTeamId ? teamsById.get(ui.partyTeamId) : null;
      const scoped = Boolean(scopedTeam && !scopedTeam.archived);
      const candidates = allBuilds.filter((b) => !b.archived && (scoped ? b.teamId === ui.partyTeamId : true));
      if (candidates.length === 0) {
        bodyEl.innerHTML = '<p class="placeholder">対象のポケモンがいません（構築にポケモンを登録してください）</p>';
        return;
      }
      bodyEl.innerHTML = `<div class="grid">${candidates.map((b) => partyCandidateHtml(b, teamsById, pokedex)).join("")}</div>`;
      bodyEl.querySelectorAll("[data-build-id]").forEach((rowEl) => {
        rowEl.addEventListener("click", () => {
          const build = candidates.find((b) => b.id === rowEl.dataset.buildId);
          if (!build) return;
          const team = teamsById.get(build.teamId);
          finish(buildPartySideFromTeam(build, team, pokedex));
          dialog.close();
        });
      });
    }

    async function drawEnemyTab() {
      bodyEl.innerHTML = '<p class="placeholder">読込中...</p>';
      const enemyTeams = (await loadAllEnemyTeams()).filter((t) => t.isReflected);
      const rows = [];
      enemyTeams.forEach((team) => {
        team.pokemon.forEach((p, idx) => {
          if (!p.speciesId) return;
          rows.push({ team, pokemon: p, key: `${team.id}:${idx}` });
        });
      });
      if (rows.length === 0) {
        bodyEl.innerHTML = '<p class="placeholder">反映ONの仮想敵構築にポケモンがいません</p>';
        return;
      }
      bodyEl.innerHTML = `<div class="grid">${rows.map((r) => enemyCandidateHtml(r, pokedex)).join("")}</div>`;
      bodyEl.querySelectorAll("[data-row-key]").forEach((rowEl) => {
        rowEl.addEventListener("click", () => {
          const row = rows.find((r) => r.key === rowEl.dataset.rowKey);
          if (!row) return;
          finish(buildEnemySideFromTeam(row.pokemon, row.team, pokedex));
          dialog.close();
        });
      });
    }

    function drawNewTab() {
      let tempSpeciesId = null;

      function render() {
        const entry = tempSpeciesId ? pokedex[tempSpeciesId] : null;
        const speciesLabel = entry ? entry.nameJa ?? entry.name : "種族を検索して選択";
        bodyEl.innerHTML = `
          <div class="field">
            <label>種族</label>
            <button type="button" class="btn" id="calc-new-pick-species">${escapeHtml(speciesLabel)}</button>
          </div>
          ${entry ? newSpeciesFormHtml(entry, tempSpeciesId, learnsets, movesData) : ""}
        `;

        bodyEl.querySelector("#calc-new-pick-species").addEventListener("click", async () => {
          const picked = await openSpeciesPicker();
          if (!picked) return;
          tempSpeciesId = picked;
          render();
        });

        if (!entry) return;

        function readNewSp() {
          const raw = STAT_KEYS.map((key) => bodyEl.querySelector(`#calc-new-sp-${key}`)?.value.trim() ?? "");
          const filledCount = raw.filter((v) => v !== "").length;
          if (filledCount === 0) return { statPoints: null, partial: false };
          if (filledCount < STAT_KEYS.length) return { statPoints: null, partial: true };
          const statPoints = {};
          STAT_KEYS.forEach((key, i) => {
            statPoints[key] = Number(raw[i]);
          });
          return { statPoints, partial: false };
        }

        function updateSpErrors() {
          const { statPoints, partial } = readNewSp();
          const errors = partial
            ? ["ステータスポイントは6つすべてに入力するか、すべて未入力にしてください"]
            : validateStatPoints(statPoints).errors;
          bodyEl.querySelector("#calc-new-sp-errors").innerHTML = errors
            .map((msg) => `<div class="field-error">${escapeHtml(msg)}</div>`)
            .join("");
          return errors.length === 0;
        }
        STAT_KEYS.forEach((key) => {
          bodyEl.querySelector(`#calc-new-sp-${key}`).addEventListener("input", updateSpErrors);
        });
        updateSpErrors();

        bodyEl.querySelector("#calc-new-confirm").addEventListener("click", () => {
          if (!updateSpErrors()) return;
          const { statPoints, partial } = readNewSp();
          if (partial) return;
          const ability = bodyEl.querySelector("#calc-new-ability").value || null;
          const nature = bodyEl.querySelector("#calc-new-nature").value || null;
          const item = bodyEl.querySelector("#calc-new-item").value.trim() || null;
          const moves = Array.from(
            { length: MOVE_SLOT_COUNT },
            (_, i) => bodyEl.querySelector(`.calc-new-move-select[data-slot="${i}"]`).value || null
          );
          const tempBuild = {
            id: null,
            teamId: null,
            speciesId: tempSpeciesId,
            ability,
            nature,
            item,
            statPoints,
            moves,
          };
          finish({
            build: tempBuild,
            pokedexEntry: pokedex[tempSpeciesId],
            sourceLabel: "新種族（一時設定・未保存）",
            sourceFormat: null,
            canEdit: false,
          });
          dialog.close();
        });
      }

      render();
    }

    function switchTab(tab) {
      tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === tab));
      if (tab === "party") drawPartyTab();
      else if (tab === "enemy") drawEnemyTab();
      else drawNewTab();
    }
    tabs.forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

    dialog.querySelector("#calc-picker-cancel").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => finish(null), { once: true });

    switchTab("party");
    dialog.showModal();
  });
}

export async function renderCalc(el) {
  const [pokedex, movesData, learnsets, overlay, nameJaLookup] = await Promise.all([
    getPokedex(),
    getMoves(),
    getLearnsets(),
    getOverlay(),
    getNameJaLookup(),
  ]);

  let atkSide = emptySide();
  let defSide = emptySide();
  let fieldState = {
    gameType: "single",
    weather: "none",
    terrain: "none",
    reflect: false,
    lightScreen: false,
    helpingHand: false,
    isCrit: false,
  };
  let lastResult = null;
  let lastErrorMessage = null;

  // パーティ画面/仮想敵画面の「ダメージ計算へ」から遷移した場合、ui-state.jsに一時保存された
  // 事前選択(calcPreselect)を読み取り該当サイドに反映する。読み取り後は即クリアする使い切り仕様
  // （次回この画面を開いたときに毎回同じ対象が復元され続けるのを防ぐため）。
  async function applyPreselect() {
    const pre = loadUiState().calcPreselect;
    if (!pre) return;
    saveUiState({ calcPreselect: null });

    let picked = null;
    try {
      if (pre.kind === "build" && pre.buildId) {
        const [build, allTeams] = await Promise.all([get("builds", pre.buildId), getAll("teams")]);
        if (build) {
          const team = allTeams.find((t) => t.id === build.teamId);
          picked = buildPartySideFromTeam(build, team, pokedex);
        }
      } else if (pre.kind === "enemyPokemon" && pre.teamId != null && pre.pokemonIndex != null) {
        const enemyTeams = await loadAllEnemyTeams();
        const team = enemyTeams.find((t) => t.id === pre.teamId);
        const pokemon = team?.pokemon?.[pre.pokemonIndex];
        if (team && pokemon) picked = buildEnemySideFromTeam(pokemon, team, pokedex);
      }
    } catch (err) {
      console.error("[calc] 事前選択の反映に失敗しました", err);
    }
    if (!picked) return;

    const nextSide = {
      ...emptySide(),
      ...picked,
      resolvedMoves: computeResolvedMoves(picked.build, movesData, nameJaLookup),
    };
    if (pre.side === "def") defSide = nextSide;
    else atkSide = nextSide;
  }

  async function pickSide(sideKey) {
    const picked = await openCalcPicker({ pokedex, movesData, learnsets });
    if (!picked) return;
    const nextSide = {
      ...emptySide(),
      ...picked,
      resolvedMoves: computeResolvedMoves(picked.build, movesData, nameJaLookup),
    };
    if (sideKey === "atk") atkSide = nextSide;
    else defSide = nextSide;
    lastResult = null;
    lastErrorMessage = null;
    draw();
  }

  async function editSide(sideKey) {
    const side = sideKey === "atk" ? atkSide : defSide;
    if (!side.build || !side.canEdit) return;
    const saved = await openBuildEditModal(side.build, side.pokedexEntry);
    if (!saved) return;
    const refreshedBuild = await get("builds", side.build.id);
    const resolvedMoves = computeResolvedMoves(refreshedBuild, movesData, nameJaLookup);
    const keepMoveId = side.moveId && resolvedMoves.some((m) => m.moveId === side.moveId) ? side.moveId : null;
    const nextSide = { ...side, build: refreshedBuild, resolvedMoves, moveId: keepMoveId };
    if (sideKey === "atk") atkSide = nextSide;
    else defSide = nextSide;
    lastResult = null;
    lastErrorMessage = null;
    draw();
  }

  async function runCalculation() {
    lastResult = null;
    lastErrorMessage = null;
    if (!atkSide.build || !defSide.build) {
      lastErrorMessage = "攻撃側・防御側の両方でポケモンを選択してください";
      draw();
      return;
    }
    if (!atkSide.build.statPoints || !defSide.build.statPoints) {
      lastErrorMessage = "ステータスポイント未入力のポケモンが含まれているため計算できません";
      draw();
      return;
    }
    if (!atkSide.moveId) {
      lastErrorMessage = "攻撃側の使用技を選択してください";
      draw();
      return;
    }
    const fieldOptions = {
      gameType: fieldState.gameType,
      weather: fieldState.weather,
      terrain: fieldState.terrain,
      reflect: fieldState.reflect,
      lightScreen: fieldState.lightScreen,
      helpingHand: fieldState.helpingHand,
    };
    lastResult = await calculateDamage(
      atkSide.build,
      atkSide.pokedexEntry,
      defSide.build,
      defSide.pokedexEntry,
      atkSide.moveId,
      fieldOptions,
      { atkMegaNameJa: atkSide.megaNameJa, defMegaNameJa: defSide.megaNameJa, isCrit: fieldState.isCrit }
    );
    draw();
  }

  function draw() {
    const warnings = mismatchWarnings(atkSide, defSide, fieldState);
    el.innerHTML = `
      <section class="card">
        <h2>ダメージ計算</h2>
        ${warningBannerHtml(warnings)}
        <div class="calc-sides">
          ${sideCardHtml(atkSide, "atk", "攻撃側", pokedex, overlay)}
          <div class="calc-vs">VS</div>
          ${sideCardHtml(defSide, "def", "防御側", pokedex, overlay)}
        </div>
      </section>
      <section class="card">
        <h2>フィールド設定</h2>
        ${fieldControlsHtml(fieldState)}
        <button type="button" class="btn btn-primary" id="calc-btn-run">計算</button>
      </section>
      <section class="card">
        <h2>計算結果</h2>
        ${resultHtml(lastResult, lastErrorMessage)}
      </section>
    `;

    el.querySelectorAll(".calc-btn-pick").forEach((btn) => {
      btn.addEventListener("click", () => pickSide(btn.dataset.side));
    });
    el.querySelectorAll(".calc-btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => editSide(btn.dataset.side));
    });
    el.querySelectorAll(".calc-mega-select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const value = e.target.value || null;
        if (e.target.dataset.side === "atk") atkSide = { ...atkSide, megaNameJa: value };
        else defSide = { ...defSide, megaNameJa: value };
        draw();
      });
    });
    const atkMoveSelect = el.querySelector("#calc-atk-move");
    atkMoveSelect?.addEventListener("change", (e) => {
      atkSide = { ...atkSide, moveId: e.target.value || null };
      draw();
    });

    el.querySelector("#calc-field-gametype").addEventListener("change", (e) => {
      fieldState = { ...fieldState, gameType: e.target.value };
      draw();
    });
    el.querySelector("#calc-field-weather").addEventListener("change", (e) => {
      fieldState = { ...fieldState, weather: e.target.value };
      draw();
    });
    el.querySelector("#calc-field-terrain").addEventListener("change", (e) => {
      fieldState = { ...fieldState, terrain: e.target.value };
      draw();
    });
    el.querySelector("#calc-field-reflect").addEventListener("change", (e) => {
      fieldState = { ...fieldState, reflect: e.target.checked };
      draw();
    });
    el.querySelector("#calc-field-lightscreen").addEventListener("change", (e) => {
      fieldState = { ...fieldState, lightScreen: e.target.checked };
      draw();
    });
    el.querySelector("#calc-field-helpinghand").addEventListener("change", (e) => {
      fieldState = { ...fieldState, helpingHand: e.target.checked };
      draw();
    });
    el.querySelector("#calc-field-crit").addEventListener("change", (e) => {
      fieldState = { ...fieldState, isCrit: e.target.checked };
      draw();
    });

    el.querySelector("#calc-btn-run").addEventListener("click", runCalculation);
  }

  await applyPreselect();
  draw();
}
