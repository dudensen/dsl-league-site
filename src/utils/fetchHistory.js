// src/lib/fetchHistory.js

function unwrapGviz(text) {
  const jsonString =
    text.match(/google\.visualization\.Query\.setResponse\((.*)\);?/s)?.[1];

  if (!jsonString) throw new Error("Failed to parse gviz response wrapper");
  return JSON.parse(jsonString);
}

function cellValue(cell) {
  // Prefer .v (raw). If missing, fallback to formatted .f
  if (!cell) return "";
  if (cell.v != null) return String(cell.v);
  if (cell.f != null) return String(cell.f);
  return "";
}

function fillForward(row) {
  const out = [];
  let last = "";
  for (let i = 0; i < row.length; i++) {
    const v = String(row[i] ?? "").replace(/\r/g, "").trim();
    if (v) last = v;
    out.push(last);
  }
  return out;
}

/**
 * Returns:
 * {
 *   grid: string[][],  // 2D array like your sheet (row0 categories, row1 headers, ...)
 *   raw: any           // raw gviz json (optional)
 * }
 */
export async function fetchHistoryTable() {
  const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ";
  const HISTORY_GID = "1853178216"; // <- set this

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${HISTORY_GID}`;

  const res = await fetch(url);
  const text = await res.text();

  const json = unwrapGviz(text);

  const table = json?.table;
  const cols = table?.cols || [];
  const rows = table?.rows || [];

  // Build grid:
  // gviz rows do not include your "row 0 categories" unless they exist as actual cells.
  // If your sheet truly has row0 categories in the sheet, they WILL appear as row index 0 here.
  // We'll convert all rows to string arrays, padded to col count.
  const colCount = Math.max(cols.length, ...rows.map(r => (r.c ? r.c.length : 0)), 0);

  const grid = rows.map((r) => {
    const arr = new Array(colCount).fill("");
    const cells = r.c || [];
    for (let i = 0; i < colCount; i++) {
      arr[i] = cellValue(cells[i]).replace(/\r/g, "").trim();
    }
    return arr;
  });

  // Defensive: if you expect row0 categories and they exist but have blanks (merged cells),
  // fill-forward row0 only.
  if (grid.length >= 1) grid[0] = fillForward(grid[0]);

  return { grid, raw: json };
}