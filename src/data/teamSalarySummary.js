function s(x) {
  return String(x ?? "").replace(/\r/g, "").trim();
}

function parseSalaryValue(raw) {
  const cleaned = String(raw ?? "")
    .replace("$", "")
    .replace("m", "")
    .trim();

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function typeTokens(v) {
  return s(v)
    .toUpperCase()
    .split(/[^A-Z0-9]+/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function isExcludedFromSalaryCap(v) {
  const toks = typeTokens(v);
  return toks.includes("M") || toks.includes("IRE");
}

export function parseWaiversFromTeamSheetRows(rows, years) {
  const out = {};

  const waiverRow = (rows || []).find(r =>
    (r || []).some(cell => typeof cell === "string" && cell.trim().toLowerCase() === "waiver")
  );

  if (!waiverRow) return out;

  const waiverIndex = waiverRow.findIndex(
    cell => typeof cell === "string" && cell.trim().toLowerCase() === "waiver"
  );

  let yearOffset = 0;

  for (let i = waiverIndex + 1; i < waiverRow.length; i++) {
    const raw = waiverRow[i];

    if (raw && String(raw).trim() !== "") {
      const value = parseSalaryValue(raw);

      if (!Number.isNaN(value) && yearOffset < years.length) {
        out[String(years[yearOffset])] = value;
        yearOffset++;
      }
    }

    if (yearOffset >= years.length) break;
  }

  return out;
}

export function buildTeamSalarySummary({
  teamPlayers,
  years,
  waiverByYear = {},
  cap = 200,
}) {
  const out = {};

  for (const year of years || []) {
    let roster = 0;
    let minors = 0;

    for (const player of teamPlayers || []) {
      let salary = 0;

      // Supports raw PlayerData rows from TeamDetail
      if (player?.[String(year)] != null) {
        salary = parseSalaryValue(player[String(year)]);
      }

      // Supports parsed TradeAnalyzer players
      if (!salary && player?.salaryByYear?.[String(year)] != null) {
        salary = Number(player.salaryByYear[String(year)] || 0);
      }

      if (!salary) continue;

      const typeValue =
        player?.["Rookie / Minor / Captain"] ??
        player?.extras?.type ??
        "";

      if (isExcludedFromSalaryCap(typeValue)) minors += salary;
      else roster += salary;
    }

    const waiver = waiverByYear?.[year] || waiverByYear?.[String(year)] || 0;

    out[String(year)] = {
      roster: roster + waiver,
      minors,
      waiver,
      capSpace: cap - (roster + waiver),
    };
  }

  return out;
}