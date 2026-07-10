import { openDB } from "./db.js";
import { loadUiState, saveUiState, applyTheme, initialTheme } from "./ui-state.js";
import { renderParty } from "./party.js";
import { renderCalc } from "./calc.js";
import { renderEnemies } from "./enemies.js";
import { renderSettings } from "./settings.js";

const PAGES = {
  party: renderParty,
  calc: renderCalc,
  enemies: renderEnemies,
  settings: renderSettings,
};

async function showPage(name) {
  if (!PAGES[name]) name = "party";
  document.querySelectorAll(".page").forEach((el) => { el.hidden = true; });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    if (b.dataset.page === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const el = document.getElementById(`page-${name}`);
  el.hidden = false;
  try {
    await PAGES[name](el);
  } catch (err) {
    console.error(`[app] page render failed: ${name}`, err);
    el.innerHTML =
      '<div class="card"><p class="placeholder">画面の描画に失敗しました。リロードしてください。</p></div>';
  }
  saveUiState({ page: name });
}

async function init() {
  const ui = loadUiState();
  applyTheme(initialTheme()); // 保存済みテーマ or OS設定に追従
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => showPage(b.dataset.page));
  });
  try {
    await openDB();
  } catch (err) {
    console.error("[app] IndexedDB open failed", err);
  }
  await showPage(ui.page || "party");
}

init();
