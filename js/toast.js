// トースト通知（Phase 6.0: alert()の仮実装を置換）。
import { escapeHtml } from "./utils.js";

const DURATION_MS = { info: 3500, success: 3500, error: 5000 };

let containerEl = null;

function ensureContainer() {
  if (!containerEl) {
    containerEl = document.createElement("div");
    containerEl.className = "toast-container";
    document.body.appendChild(containerEl);
  }
  return containerEl;
}

// type: "info" | "success" | "error"
export function showToast(message, { type = "info" } = {}) {
  const container = ensureContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span><button type="button" class="toast-close" aria-label="閉じる">×</button>`;
  container.appendChild(toast);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.remove();
  };
  const hide = () => {
    clearTimeout(hideTimer);
    toast.classList.add("is-hiding");
    toast.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 500); // transitionendが発火しない環境向けの保険
  };

  const duration = DURATION_MS[type] ?? DURATION_MS.info;
  const hideTimer = setTimeout(hide, duration);
  toast.querySelector(".toast-close").addEventListener("click", hide);
}
