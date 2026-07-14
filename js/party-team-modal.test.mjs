import { test } from "node:test";
import assert from "node:assert/strict";
import { regulationOptionsHtml } from "./party-team-modal.js";

test("regulationOptionsHtml: 既知の値(M-A)を渡すと対応するoptionが選択される", () => {
  const html = regulationOptionsHtml("M-A");
  assert.match(html, /<option value="M-A" selected>M-A<\/option>/);
  assert.doesNotMatch(html, /旧値/);
});

test("regulationOptionsHtml: 未知の値(旧データ)を渡すと「(旧値: ○○)」optionが追加され選択される", () => {
  const html = regulationOptionsHtml("レギュレーションX");
  assert.match(html, /<option value="レギュレーションX" selected>\(旧値: レギュレーションX\)<\/option>/);
  // 既存のM-A/M-Bどちらも選択状態にならないこと
  assert.doesNotMatch(html, /"M-A" selected/);
  assert.doesNotMatch(html, /"M-B" selected/);
});

test("regulationOptionsHtml: 旧値のoptionはCONFIG.regulationsのoption群より後ろに追加される", () => {
  const html = regulationOptionsHtml("レギュレーションX");
  const legacyIndex = html.indexOf("旧値");
  const mbIndex = html.indexOf("M-B");
  assert.ok(mbIndex < legacyIndex);
});
