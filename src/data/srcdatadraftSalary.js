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

  // fixed salaries
  { from: 25, to: 36, fixed: 2 },
  { from: 37, to: 48, fixed: 1 },
];

export function parseMoneyValue(x) {
  if (x == null || x === "") return 0;

  const n = Number(
    String(x)
      .replace(/[,€$]/g, "")
      .replace(/m/gi, "")
      .trim()
  );

  return Number.isFinite(n) ? n : 0;
}

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

export function buildDraftSalaryTableForYear({ year, maxSalary }) {
  return Array.from({ length: 48 }, (_, i) => {
    const pick = i + 1;

    return {
      year: String(year),
      pick,
      salary: getDraftSalaryForPick({ pick, maxSalary }),
    };
  });
}

export function getMaxSalaryForYearFromRows({ rows, year }) {
  const y = String(year);

  let max = 0;

  for (const row of rows || []) {
    const value = parseMoneyValue(row?.[y]);
    if (value > max) max = value;
  }

  return max;
}

export function buildDraftSalaryTablesFromPlayerRows({ rows, years }) {
  const out = {};

  for (const year of years || []) {
    const maxSalary = getMaxSalaryForYearFromRows({ rows, year });

    out[String(year)] = {
      year: String(year),
      maxSalary,
      picks: buildDraftSalaryTableForYear({
        year,
        maxSalary,
      }),
    };
  }

  return out;
}