import { test } from "node:test";
import assert from "node:assert/strict";
import { regulationOptionsHtml } from "./enemy-team-modal.js";

test("regulationOptionsHtml: null/undefinedは「未設定」が選択される", () => {
  const html = regulationOptionsHtml(null);
  assert.match(html, /<option value="" selected>未設定<\/option>/);
  assert.doesNotMatch(html, /旧値/);
});

test("regulationOptionsHtml: 空文字も「未設定」が選択される(旧値扱いにしない)", () => {
  const html = regulationOptionsHtml("");
  assert.match(html, /<option value="" selected>未設定<\/option>/);
  assert.doesNotMatch(html, /旧値/);
});

test("regulationOptionsHtml: 既知の値(M-B)を渡すと対応するoptionが選択される", () => {
  const html = regulationOptionsHtml("M-B");
  assert.match(html, /<option value="M-B" selected>M-B<\/option>/);
  assert.doesNotMatch(html, /旧値/);
});

test("regulationOptionsHtml: 未知の値(旧データ)を渡すと「(旧値: ○○)」optionが追加され選択される", () => {
  const html = regulationOptionsHtml("レギュレーションY");
  assert.match(html, /<option value="レギュレーションY" selected>\(旧値: レギュレーションY\)<\/option>/);
});
