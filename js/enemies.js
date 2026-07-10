// 仮想敵・メジャー構築画面（Phase 4で本実装）
import { CONFIG } from "./config.js";
import { escapeHtml, safeHttpsUrl } from "./utils.js";

export async function renderEnemies(el) {
  let presets = [];
  try {
    const res = await fetch(CONFIG.presets.majorTeams);
    if (res.ok) presets = await res.json();
  } catch (err) {
    console.warn("[enemies] プリセット読込失敗（未配置なら正常）", err);
  }
  if (!Array.isArray(presets)) {
    console.warn("[enemies] プリセットJSONが配列ではありません");
    presets = [];
  }
  const list = presets
    .map(
      (t) => `
      <li>
        <strong>${escapeHtml(t.name)}</strong>（${(Array.isArray(t.pokemon) ? t.pokemon : []).map((p) => escapeHtml(p.species)).join(" / ")}）
        ${safeHttpsUrl(t.sourceUrl) ? `<a href="${escapeHtml(safeHttpsUrl(t.sourceUrl))}" target="_blank" rel="noopener">出典記事</a>` : ""}
      </li>`
    )
    .join("");
  el.innerHTML = `
    <section class="card">
      <h2>メジャーな構築（プリセット）</h2>
      ${list ? `<ul>${list}</ul>` : '<p class="placeholder">プリセット未読込</p>'}
    </section>
    <section class="card">
      <h2>ユーザー構築</h2>
      <p class="placeholder">TODO(Phase 4): 任意6匹の登録・「他画面へ反映」選択</p>
    </section>
  `;
}
