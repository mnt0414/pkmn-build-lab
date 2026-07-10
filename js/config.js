// 定数・外部リンクURLテンプレート。
// URL構造の変更は必ずここだけで完結させる（各画面へのハードコード禁止）。
export const CONFIG = {
  appName: "PKMN BUILD LAB.",
  version: "0.1.0",
  links: {
    // ポケ轍（ポケモン徹底攻略）各ポケモンの育成論・図鑑ページへの送客リンク。
    // 導線は 1)ポケモン一覧選択時 2)育成データ登録・編集画面 の2箇所。
    yakkunTheoryUrl: (no) => `https://yakkun.com/sv/theory/p${no}`,
    yakkunZukanUrl: (no) => `https://yakkun.com/sv/zukan/n${no}`,
    credits: {
      showdown: "https://pokemonshowdown.com/",
      pkmnProject: "https://pkmn.cc/",
      pokeapi: "https://pokeapi.co/",
      yakkun: "https://yakkun.com/",
    },
  },
  presets: {
    majorTeams: "data/presets/major-teams.json",
  },
};
