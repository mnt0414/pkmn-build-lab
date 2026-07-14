# Round 1A 実装結果(再提出)

状態: mainへマージ済み・originへのpush未実施・deploy未実施・Round1B未着手
- Round1A実装コミット(`uiux-round1a`ブランチ): `a6d2cdc`〜`4f34308`(7コミット、17ファイル・467行追加/53行削除)
- mainマージコミット: `6d5dcb7`(`--no-ff`)
- 報告書更新コミット: `18cb2a9`

## 変更ファイル
- `js/config.js`: `CONFIG.regulations`(`{id,label}`静的リスト、M-A/M-B)を追加
- `js/party-team-modal.js`(+`.test.mjs`新規): レギュレーションselect化、旧値表示・保持ロジック(テスト化済み)
- `js/enemy-team-modal.js`(+`.test.mjs`新規): 同上(任意・「未設定」対応)
- `js/enemies.js`: レギュレーションフィルタを`CONFIG.regulations`+既存値の和集合に変更
- `js/party-add-dialog.js`, `js/calc.js`: 「種族」→「ポケモン」表記統一
- `js/party.js`: 「選出6匹」→「構築メンバー」表記統一、カードへのスプライト表示追加
- `js/models.js`(+`.test.mjs`更新): `STAT_LABELS`集約、SPエラーメッセージ日本語化
- `js/party-build-modal.js`, `js/enemy-team-modal.js`: 重複`STAT_LABELS`削除・import化
- `js/pokemon-identity.js`(新規): スプライト表示共通helper
- `js/utils.js`(+`.test.mjs`大幅追加): `hiraganaToKatakana`/`searchByName`/`searchPokemon`(日本語名・英語名・speciesId・図鑑番号・優先順位ソート)
- `js/species-picker.js`: 検索ロジック拡張、50件打ち切り表示、キーボード操作(上下矢印/Enter/Esc/フォーカス復帰)・ARIA(combobox/listbox/aria-activedescendant等)対応
- `css/style.css`: hover/activeの視覚分離、スクリーンリーダー用`.sr-only`等

## 1. キーボード操作・ARIA
| 項目 | 結果 |
|---|---|
| 上下矢印で候補移動 | PASS |
| Enterで決定 | PASS |
| Escで閉じる | PASS(ネイティブdialog挙動) |
| 閉じた後トリガーへフォーカス復帰 | PASS |
| 選択中候補の視覚的区別 | PASS(`.is-active`とhoverを別色で分離) |
| hover/keyboard選択の混同なし | PASS |
| 再描画後のactiveIndex境界安全性 | PASS(0件/末尾折り返し確認) |
| 0件時の矢印/Enter安全性 | PASS(例外なし) |
| 50件打ち切り時のキーボード移動 | PASS |
| role="combobox"+aria-expanded/aria-controls/aria-activedescendant | PASS |
| role="listbox"/"option"+一意id+aria-selected | PASS |
| 件数・0件・読込中・エラー状態の通知 | `#species-status`(`role="status" aria-live="polite"`)で通知。候補一覧本体は非live(全候補読み上げ防止のため) |

## 2. 検索対象
| クエリ | 結果 | 判定 |
|---|---|---|
| `ぴか` | ピカチュウ | PASS |
| `ピカ` | ピカチュウ | PASS |
| `Pikachu` | ピカチュウ | PASS |
| `pikachu` | ピカチュウ | PASS |
| speciesId完全一致 | 最優先表示 | PASS |
| 図鑑番号`25`完全一致 | ピカチュウ系ヒット | PASS |
| 部分一致フォールバック | PASS | |
| 該当0件 | 例外なし | PASS |
| 50件超過 | 「他N件」表示 | PASS |

優先順位: 図鑑番号完全一致 → speciesId完全一致 → 前方一致 → 部分一致。

## 3. 育成論リンク分離
選択ボタンとリンクは分離済み(390px実測間隔8.0px)。相互誤発火なし、`target="_blank" rel="noopener"`確認、Tab順「検索欄→選択→リンク」で一貫。PASS(修正不要)。

## 4. レギュレーション網羅テスト
新規M-A初期選択/M-B変更保存、仮想敵「未設定」初期選択/M-A・M-B選択保存、旧値のIndexedDB注入→「(旧値)」表示→未選び直しなら保存値不変→選び直せば上書き、リロード後の値維持、フィルタへの旧値反映、パーティ側未設定保存不可、仮想敵側未設定保存可 — 全15項目PASS。

## 5. skipテスト
| 項目 | 内容 |
|---|---|
| ファイル/テスト名 | `js/calc-engine.test.mjs` |
| skip理由 | `calc-engine.js`がCDN経由httpsを`import`しており、Node標準ESMローダーが`https:`スキームを解決できないため(実行して`ERR_UNSUPPORTED_ESM_URL_SCHEME`系エラーを確認済み) |
| Round1Aとの関係 | なし。`git log`で該当ファイルの変更はPhase5.0〜5.2のみ、Round1Aのコミットは一切触れていない |
| 手動確認 | ブラウザ実機(ダメージ計算画面遷移、console error 0件)で代替確認済み |
| マージ非阻害の根拠 | Phase5から続く既知の環境制約であり、今回変更による新規劣化ではない |

## 6. レスポンシブ・テーマ確認
390/768/1440 × light/dark 全6組み合わせ×主要データ状態(0件/1件/複数件/検索1件/50件超過/スプライト正常・フォールバック/旧レギュレーション表示/フォーカスリング)で確認。横スクロール・console error・console warning、全て0件。スクリーンショット29枚を`scratchpad/round1a-verify/`(一時ディレクトリ、リポジトリ外)に保存。

## 7. テスト結果
- `node --test`: 146件中145 pass・1 skip(上記5)・0 fail(新規9件追加)
- `npm run data:verify`: 17件全pass

## 未解決事項(新規発見、今回は修正せず報告のみ)
`js/party.js`の候補ポケモン件数表示(`countBuildsForTeam`)が、候補プールではなく構築メンバー込みの全build数を数えている軽微な不具合を発見。Round1B「候補プールと構築メンバーの交換」領域に近接するスコープのため、今回は修正せず報告のみ。

**Round1Bへの引き継ぎ事項(2026-07-15、ユーザー承認時に仕様確定)**:
- 構築メンバー数: `selectedBuildIds.length` / 6
- 候補数: `poolBuildIds.length`
- アーカイブ済みbuildはいずれのカウントにも含めない

## 回帰リスク
低。全チェックリスト・自動テスト・データ検証が通過。

## 判定
指摘事項1〜7全項目PASS。ユーザー承認により`uiux-round1a`をmainへ`--no-ff`マージ済み(マージコミット、2026-07-15)。main上でも`node --test`(146件中145 pass・1 skip・0 fail)・`npm run data:verify`(17件全pass)を再確認し、承認時と同じ結果であることを確認。push・deployは未実施(ユーザー手動)。Round1Bは`uiux-round1b`ブランチを新規作成して着手する。
