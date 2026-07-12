// 仮想敵データ（プリセット+ユーザー構築）の読込・正規化・反映(isReflected)overrideの適用をまとめる共通モジュール。
// enemies.js（仮想敵タブ本体）とparty.js（素早さ比較への反映）の両方から利用する。
import { CONFIG } from "./config.js";
import { createEnemyTeam } from "./models.js";
import { get, put, getAll } from "./db.js";

const PRESET_OVERRIDES_KEY = "presetReflectedOverrides";

export async function loadPresets() {
  let raw = [];
  try {
    const res = await fetch(CONFIG.presets.majorTeams);
    if (res.ok) raw = await res.json();
  } catch (err) {
    console.warn("[enemies-data] プリセット読込失敗（未配置なら正常）", err);
  }
  if (!Array.isArray(raw)) {
    console.warn("[enemies-data] プリセットJSONが配列ではありません");
    raw = [];
  }
  return raw.map((t) => createEnemyTeam(t));
}

// プリセットのisReflectedはユーザーのローカルoverrideを静的JSONの初期値より優先する。
// 静的JSON側は書き換えない（プリセット更新後もユーザーのON/OFFを保持するため）。
export async function loadPresetOverrides() {
  const row = await get("meta", PRESET_OVERRIDES_KEY);
  return row?.overrides ?? {};
}

export async function savePresetOverride(id, isReflected) {
  const row = await get("meta", PRESET_OVERRIDES_KEY);
  const overrides = { ...(row?.overrides ?? {}), [id]: isReflected };
  await put("meta", { key: PRESET_OVERRIDES_KEY, overrides });
  return overrides;
}

export function applyOverrides(teams, overrides) {
  return teams.map((t) => (t.id in overrides ? { ...t, isReflected: overrides[t.id] } : t));
}

export async function loadUserTeams() {
  const rows = await getAll("enemyTeams");
  return rows.filter((t) => t.sourceType === "user").map((t) => createEnemyTeam(t));
}

// 読込+正規化(createEnemyTeam)+override適用をまとめて行う便利関数。プリセット・ユーザー構築を1配列にまとめて返す。
// プリセット/ユーザーの区別が必要な呼び出し側はsourceTypeで判定する。
export async function loadAllEnemyTeams() {
  const [presets, overrides, userTeams] = await Promise.all([loadPresets(), loadPresetOverrides(), loadUserTeams()]);
  return [...applyOverrides(presets, overrides), ...userTeams];
}
