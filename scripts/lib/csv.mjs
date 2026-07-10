// 極小CSVパーサ。クォート・カンマエスケープなしの単純なCSV専用(pokemon_list.csv用)。
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",");
  return rows.map((line) => {
    const cells = line.split(",");
    return headers.reduce((acc, header, i) => {
      acc[header] = cells[i] ?? "";
      return acc;
    }, {});
  });
}
