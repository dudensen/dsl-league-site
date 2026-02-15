// src/data/googleSheets.js
export async function fetchGviz({ sheetId, gid }) {
  const url =
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?` +
    `gid=${gid}&tqx=out:json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const text = await res.text();

  const jsonText = text
    .replace(/^[\s\S]*?setResponse\(/, "")
    .replace(/\);\s*$/, "");

  return JSON.parse(jsonText);
}

export function gvizToMatrix(gvizJson) {
  const cols = gvizJson.table.cols.map(c => (c.label || "").trim());
  const rows = gvizJson.table.rows.map(r => r.c.map(cell => cell?.v ?? ""));
  return { cols, rows };
}