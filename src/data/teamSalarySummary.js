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
// -----------------------------
// Draft / rookie salary estimate
// -----------------------------

export function getRookieSalaryForPick(pickNumber) {
  const pick = Number(pickNumber)

  if (!Number.isFinite(pick) || pick <= 0) return 0

  // Based on current max salary 73m and your draft salary table
  if (pick === 1) return 18
  if (pick === 2) return 16
  if (pick === 3) return 15
  if (pick >= 4 && pick <= 5) return 13
  if (pick >= 6 && pick <= 7) return 12
  if (pick >= 8 && pick <= 9) return 10
  if (pick >= 10 && pick <= 12) return 9
  if (pick >= 13 && pick <= 15) return 8
  if (pick >= 16 && pick <= 18) return 6
  if (pick >= 19 && pick <= 21) return 5
  if (pick >= 22 && pick <= 24) return 3
  if (pick >= 25 && pick <= 36) return 2
  if (pick >= 37 && pick <= 48) return 1

  return 0
}

function normDraftTeamName(x) {
  return String(x ?? "")
    .replace(/\r/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[’'“”"]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/**
 * Reads the draft order table from a team sheet.
 *
 * In your sheet:
 * - draft order starts at Google row 44
 * - team names are in column D
 *
 * JS indexes:
 * - row 44 = index 43
 * - column D = index 3
 */
export function buildDraftOrderFromTeamSheetRows(rows) {
  const out = {}

  const normLocal = x =>
    String(x ?? "")
      .replace(/\r/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/[’'“”"]/g, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()

  const clean = x => String(x ?? "").replace(/\r/g, "").trim()

  const toNumber = x => {
    const raw = String(x ?? "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "")

    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  let headerRowIndex = -1
  let teamCol = -1
  let pick1Col = -1
  let given1Col = -1
  let salary1Col = -1
  let pick2Col = -1
  let given2Col = -1
  let salary2Col = -1

  // Find a header row that contains Team + Pick columns.
  // This is safer than assuming Pick is exactly teamCol + 4.
  for (let r = 0; r < (rows || []).length; r++) {
    const row = rows[r] || []
    const normalized = row.map(normLocal)

    for (let c = 0; c < normalized.length; c++) {
      if (normalized[c] !== "team") continue

      const pickCols = []
      for (let i = c + 1; i < normalized.length; i++) {
        if (normalized[i] === "pick") pickCols.push(i)
      }

      if (!pickCols.length) continue

      const hasW = normalized.includes("w")
      const hasL = normalized.includes("l")
      const hasTie = normalized.includes("tie")

      if (!hasW || !hasL || !hasTie) continue

      headerRowIndex = r
      teamCol = c

      pick1Col = pickCols[0]
      pick2Col = pickCols[1] ?? -1

      // Normally:
      // Pick | given to: | $
      given1Col = pick1Col + 1

      const firstSectionEnd = pick2Col > -1 ? pick2Col : row.length
      salary1Col = -1

      for (let i = pick1Col + 1; i < firstSectionEnd; i++) {
        const h = normalized[i]
        if (h === "$" || h.includes("$") || h === "salary") {
          salary1Col = i
          break
        }
      }

      // Fallback if the "$" header is merged/odd in the CSV.
      if (salary1Col === -1) salary1Col = pick1Col + 2

      if (pick2Col > -1) {
        given2Col = pick2Col + 1
        salary2Col = -1

        for (let i = pick2Col + 1; i < row.length; i++) {
          const h = normalized[i]
          if (h === "$" || h.includes("$") || h === "salary") {
            salary2Col = i
            break
          }
        }

        if (salary2Col === -1) salary2Col = pick2Col + 2
      }

      break
    }

    if (headerRowIndex !== -1) break
  }

  if (headerRowIndex === -1 || teamCol === -1 || pick1Col === -1) {
    return out
  }

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || []

    const originalTeam = clean(row[teamCol])
    if (!originalTeam) continue

    const pick1 = toNumber(row[pick1Col])
    const salary1 = toNumber(row[salary1Col])

    if (pick1 && pick1 >= 1 && pick1 <= 24) {
      out[normDraftTeamName(originalTeam)] = {
        team: originalTeam,
        pick: pick1,
        salary: salary1 ?? getRookieSalaryForPick(pick1),
        round: "A",
        givenTo: clean(row[given1Col]),
      }
    }

    if (pick2Col > -1) {
      const pick2 = toNumber(row[pick2Col])
      const salary2 = toNumber(row[salary2Col])
      const given2 = clean(row[given2Col])

      if (pick2 && pick2 >= 25 && pick2 <= 48 && given2) {
        out[`${normDraftTeamName(given2)}__round_b__${pick2}`] = {
          team: given2,
          pick: pick2,
          salary: salary2 ?? getRookieSalaryForPick(pick2),
          round: "B",
          givenTo: given2,
        }
      }
    }
  }

  return out
}

/**
 * Calculates rookie estimate from owned Round A picks.
 *
 * picksByYear shape:
 * {
 *   2026: { A: ["Samarina Dudenbros"], B: [...] }
 * }
 *
 * draftOrderByYear shape:
 * {
 *   2026: {
 *     "samarina dudenbros": { pick: 10, salary: 9 }
 *   }
 * }
 */
export function buildDraftEstimateByYear({
  picksByYear = {},
  draftOrderByYear = {},
  years = [],
  applyToNextSeason = true,
}) {
  const out = {}

  for (const salaryYear of years || []) {
    const salaryYearKey = String(salaryYear)

    // Draft happens before the next season starts.
    // So 2026 draft picks count against 2027 salary.
    const draftYear = applyToNextSeason
      ? Number(salaryYear) - 1
      : Number(salaryYear)

    const draftYearKey = String(draftYear)

    const ownedFirstRoundPicks =
      picksByYear?.[draftYear]?.A ||
      picksByYear?.[draftYearKey]?.A ||
      []

    const draftOrderMap = draftOrderByYear?.[draftYearKey] || {}

    const items = ownedFirstRoundPicks.map(team => {
      const hit = draftOrderMap[normDraftTeamName(team)]

      return {
        team,
        draftYear,
        salaryYear: Number(salaryYear),
        pick: hit?.pick ?? null,
        salary: hit?.salary ?? 0,
      }
    })

    const total = items.reduce((sum, x) => sum + Number(x.salary || 0), 0)

    out[salaryYearKey] = {
      draftYear,
      salaryYear: Number(salaryYear),
      count: ownedFirstRoundPicks.length,
      items,
      total,
      label: total > 0 ? `$${total}m` : ownedFirstRoundPicks.length ? "TBD" : "$0m",
    }
  }

  return out
}


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