# data/sources/

外部プロジェクトから流用した一次データ置き場。

## pokemon_list.csv

- **由来**: 姉妹プロジェクト BATTLEREC(`pkmn-buttledata`リポジトリ)の`pokemon_list.csv`をそのままコピー。
- **列**: `no,name,type1,type2,sprite_override,sprite_url,yakkun_url`
  - `no`: 全国図鑑番号
  - `name`: 日本語名(フォルム違いは`sprite_override`列に値が入り、`name`にフォルム名を含む表記になる)
  - `type1`/`type2`: 日本語タイプ名(`type2`はタイプ1つのポケモンで空)
  - `sprite_override`: フォルム識別子(空でない行はフォルム違い。`data/patches/form-map.json`で`@pkmn/dex`のspeciesIdと対応付ける)
  - `sprite_url`: 図鑑画像URL
  - `yakkun_url`: ポケ轍(ポケモン徹底攻略)の図鑑ページURL
- **用途**:
  - `scripts/data-build.mjs`で`data/generated/pokedex.json`とJOINし、`nameJa`/`typesJa`/`spriteUrl`/`yakkunZukanUrl`/`yakkunTheoryUrl`を`data/dist/pokedex.json`に追加する(日本語UI表示用の補助データ)。
  - `scripts/data-verify.mjs`でCSV全行がpokedexに解決できるか(孤立行の検出)を検証する。
- **更新方法**: BATTLEREC側(`pkmn-buttledata`)を人手で確認したうえで、このファイルを丸ごと再コピーする。**このリポジトリ内で直接編集しない**(BATTLEREC側が正)。
