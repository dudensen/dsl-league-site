// src/lib/payroll.js
export const CAP_LIMIT = 200_000_000;

const toNum = (x) => {
  const n = Number(String(x ?? "").replace(/[,€$]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

const waiverToDollars = (waiverMillionValue) => toNum(waiverMillionValue) * 1_000_000;

/**
 * waiversByTeam: { [teamId]: { [year]: number } }   // stored as "millions" based on your parsing
 */
export function getWaiverCapHitDollars({ teamId, year, waiversByTeam }) {
  const m = waiversByTeam?.[teamId]?.[year];
  return waiverToDollars(m);
}

export function calcTeamPayrollForYear({ players, teamId, year, waiversByTeam }) {
  const base = players
    .filter((p) => (p.teamId || "").trim() === teamId)
    .reduce((sum, p) => sum + toNum(p.salaryByYear?.[year]), 0);

  const waiverHit = getWaiverCapHitDollars({ teamId, year, waiversByTeam });
  return base + waiverHit;
}

export function calcTeamPayrollByYear({ players, years, waiversByTeam }) {
  const teams = Array.from(new Set(players.map((p) => (p.teamId || "").trim()).filter(Boolean)));
  const out = {};
  for (const t of teams) {
    out[t] = {};
    for (const y of years) out[t][y] = calcTeamPayrollForYear({ players, teamId: t, year: y, waiversByTeam });
  }
  return out;
}