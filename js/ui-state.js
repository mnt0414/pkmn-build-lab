// UI状態（localStorage）とテーマ適用。本データはIndexedDB（db.js）を使うこと。
// app.js と settings.js の両方から使うため独立モジュールにしている（循環import防止）。
const UI_STATE_KEY = "pbl-ui";

export function loadUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveUiState(patch) {
  localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...loadUiState(), ...patch }));
}

export function applyTheme(theme) {
  document.body.classList.toggle("theme-dark", theme === "dark");
  saveUiState({ theme });
}

// 保存済みテーマがなければOS設定（prefers-color-scheme）に追従
export function initialTheme() {
  const saved = loadUiState().theme;
  if (saved) return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
