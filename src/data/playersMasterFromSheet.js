// src/data/playersMasterFromSheet.js
function norm(x) {
  return String(x ?? "").trim().toLowerCase();
}
function parseNumber(x) {
  if (x == null || x === "") return 0;
  const n = Number(String(x).replace(/[,€$]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
function idxOf(headers, name) {
  const target = norm(name);
  return headers.findIndex(h => norm(h) === target);
}

export function playersFromPlayersMaster({ rows, headerRowIndex = 1, dataStartRowIndex = 2 }) {
  // rows are 0-based; headerRowIndex=1 means "row2"
  const headers = rows[headerRowIndex].map(h => String(h).trim());

  const iPlayer = idxOf(headers, "Player");
  const iOwner  = idxOf(headers, "Current Owner");
  const iPos    = idxOf(headers, "Position");

  if (iPlayer === -1) throw new Error("Players Master: 'Player' column not found in row2");
  if (iOwner === -1) throw new Error("Players Master: 'Current Owner' column not found in row2");

  // Salaries by year: you have 2021..2030 columns
  const years = [];
  const salaryIdxByYear = {};
  for (let y = 2021; y <= 2030; y++) {
    const idx = idxOf(headers, String(y));
    if (idx !== -1) {
      years.push(String(y));
      salaryIdxByYear[String(y)] = idx;
    }
  }

  // FP columns: your sheet has these (and more)
  const iFpts   = idxOf(headers, "Fpts");
  const iFptsG  = idxOf(headers, "Fpts/G");
  const iFpts$  = idxOf(headers, "Fpts/$");
  const iFptsG$ = idxOf(headers, "Fpts/G/$");
  const iG      = idxOf(headers, "G");

  // Historical season stats you also have, if you ever want them:
  // e.g. "2025 Fpts/g", "2025 G" etc.
  const hist = {};
  for (let y = 2020; y <= 2025; y++) {
    const fpgIdx = idxOf(headers, `${y} Fpts/g`);
    const gIdx   = idxOf(headers, `${y} G`);
    if (fpgIdx !== -1) hist[`${y}_fpg`] = fpgIdx;
    if (gIdx !== -1) hist[`${y}_g`] = gIdx;
  }

  const players = [];
  for (let r = dataStartRowIndex; r < rows.length; r++) {
    const row = rows[r];
    const name = String(row[iPlayer] ?? "").trim();
    if (!name) continue;

    const teamId = String(row[iOwner] ?? "").trim(); // treat owner as team
    const position = iPos !== -1 ? String(row[iPos] ?? "").trim() : "";

    const salaryByYear = {};
    for (const y of years) {
      salaryByYear[y] = parseNumber(row[salaryIdxByYear[y]]);
    }

    // Prefer the explicit columns if present, but fall back gracefully
    const games = iG !== -1 ? parseNumber(row[iG]) : 0;
    const fpTotal = iFpts !== -1 ? parseNumber(row[iFpts]) : 0;

    const fpPerGame =
      iFptsG !== -1 ? parseNumber(row[iFptsG]) :
      (games > 0 ? fpTotal / games : 0);

    // These are already precomputed in your sheet — use them if present
    const fpPerDollar = iFpts$ !== -1 ? parseNumber(row[iFpts$]) : 0;
    const fpPerGamePerDollar = iFptsG$ !== -1 ? parseNumber(row[iFptsG$]) : 0;

    // Optional: keep Fantrax code as id if you want stable IDs
    const iFantrax = idxOf(headers, "Fantrax code");
    const playerId = iFantrax !== -1 && String(row[iFantrax] ?? "").trim()
      ? String(row[iFantrax]).trim()
      : `row-${r + 1}`;

    players.push({
      playerId,
      name,
      teamId,
      position,
      salaryByYear,
      stats: {
        fpTotal,
        games,
        fpPerGame,
        fpPerDollar,
        fpPerGamePerDollar,
        // optional hist if you want later
        hist: Object.keys(hist).length ? Object.fromEntries(
          Object.entries(hist).map(([k, idx]) => [k, parseNumber(row[idx])])
        ) : undefined
      }
    });
  }

  return { players, years };
}