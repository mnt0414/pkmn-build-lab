// @smogon/calc（CDN経由ESM）の薄いラッパー。Phase 5.0時点では骨格のみ。
// 注意: bare URL（/+esmサフィックスなし）はCommonJS解決になりrequire is not definedエラーになるため、
// 必ず/+esmを付けること（BATTLEREC側で検証済み）。
import * as smogon from "https://cdn.jsdelivr.net/npm/@smogon/calc@0.11/+esm";

export function getSmogonCalc() {
  return smogon;
}

// 動作確認用（後続サブフェーズで本実装する際に置き換える想定）
export function getGeneration() {
  return smogon.Generations.get(9);
}
