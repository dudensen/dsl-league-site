// src/data/teamSalarySummary.js

function s(x) {
  return String(x ?? "").replace(/\r/g, "").trim();
}

export function parseSalaryValue(raw) {
  const cleaned = String(raw ?? "")
    .replace("$", "")
    .replace("m", "")
    .replace(/,/g, "")
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

export function isExcludedFromSalaryCap(v) {
  const toks = typeTokens(v);
  return toks.includes("M") || toks.includes("IRE");
}

/* ----------------------------- Waivers ----------------------------- */

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

      if (Number.isFinite(value) && yearOffset < years.length) {
        out[String(years[yearOffset])] = value;
        yearOffset++;
      }
    }

    if (yearOffset >= years.length) break;
  }

  return out;
}

/* ----------------------------- Draft salaries ----------------------------- */

export const DRAFT_SALARY_RULES = [
  { from: 1, to: 1, percent: 0.25 },
  { from: 2, to: 2, percent: 0.23 },
  { from: 3, to: 3, percent: 0.21 },
  { from: 4, to: 5, percent: 0.19 },
  { from: 6, to: 7, percent: 0.17 },
  { from: 8, to: 9, percent: 0.15 },
  { from: 10, to: 12, percent: 0.13 },
  { from: 13, to: 15, percent: 0.11 },
  { from: 16, to: 18, percent: 0.09 },
  { from: 19, to: 21, percent: 0.07 },
  { from: 22, to: 24, percent: 0.05 },
  { from: 25, to: 36, fixed: 2 },
  { from: 37, to: 48, fixed: 1 },
];

export function getDraftSalaryForPick({ pick, maxSalary }) {
  const p = Number(pick);
  const max = Number(maxSalary);

  if (!Number.isFinite(p) || p <= 0) return 0;

  const rule = DRAFT_SALARY_RULES.find(r => p >= r.from && p <= r.to);
  if (!rule) return 0;

  if (rule.fixed != null) return rule.fixed;

  if (!Number.isFinite(max) || max <= 0) return 0;

  return Math.floor(max * rule.percent);
}

export function getMaxSalaryForYearFromRows({ rows, year }) {
  const y = String(year);
  let max = 0;

  for (const row of rows || []) {
    const value = parseSalaryValue(row?.[y]);
    if (value > max) max = value;
  }

  return max;
}

/**
 * Converts owned Round A picks into salary.
 *
 * Expected shape:
 * {
 *   2026: [
 *     { label: "Samarina Dudenbros", pick: 1 },
 *     { label: "Xanthi Ducks", pick: 18 }
 *   ]
 * }
 *
 * If pick is missing, salary becomes 0 for now.
 * Later Fantrax draft API should fill pick.
 */
export function buildDraftSalaryByYear({
  firstRoundPicksByYear = {},
  maxSalaryByYear = {},
}) {
  const out = {};

  for (const [year, picks] of Object.entries(firstRoundPicksByYear || {})) {
    const maxSalary = maxSalaryByYear?.[year] ?? 0;

    const items = (picks || []).map(pickInfo => {
      const pick =
        typeof pickInfo === "number"
          ? pickInfo
          : pickInfo?.pick ?? pickInfo?.position ?? null;

      const label =
        typeof pickInfo === "object"
          ? pickInfo?.label || pickInfo?.team || pickInfo?.name || ""
          : "";

      const salary = pick
        ? getDraftSalaryForPick({ pick, maxSalary })
        : 0;

      return {
        label,
        pick,
        salary,
      };
    });

    out[String(year)] = {
      items,
      total: items.reduce((sum, x) => sum + Number(x.salary || 0), 0),
    };
  }

  return out;
}

/* ----------------------------- Main salary summary ----------------------------- */

export function buildTeamSalarySummary({
  teamPlayers,
  years,
  waiverByYear = {},
  cap = 200,

  // NEW: optional draft salary support
  draftSalaryByYear = {},
}) {
  const out = {};

  for (const year of years || []) {
    const yearKey = String(year);

    let roster = 0;
    let minors = 0;

    for (const player of teamPlayers || []) {
      let salary = 0;

      // Supports raw PlayerData rows from TeamDetail
      if (player?.[yearKey] != null) {
        salary = parseSalaryValue(player[yearKey]);
      }

      // Supports parsed TradeAnalyzer players
      if (!salary && player?.salaryByYear?.[yearKey] != null) {
        salary = Number(player.salaryByYear[yearKey] || 0);
      }

      if (!salary) continue;

      const typeValue =
        player?.["Rookie / Minor / Captain"] ??
        player?.extras?.type ??
        "";

      if (isExcludedFromSalaryCap(typeValue)) minors += salary;
      else roster += salary;
    }

    const waiver = waiverByYear?.[yearKey] || waiverByYear?.[year] || 0;

    const draftInfo = draftSalaryByYear?.[yearKey] || {};
    const draft = Number(draftInfo?.total || 0);

    const capPayroll = roster + waiver + draft;

    out[yearKey] = {
      roster: roster + waiver,
      minors,
      waiver,

      // NEW
      draft,
      draftItems: draftInfo?.items || [],

      // total cap payroll including draft
      capPayroll,

      capSpace: cap - capPayroll,
    };
  }

  return out;
}