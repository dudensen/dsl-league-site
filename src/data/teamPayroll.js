// src/trade/teamPayroll.js
export function computeTeamPayrollByYear({ players, years }) {
  const payroll = {}; // { [teamId]: { [year]: number } }

  for (const p of players) {
    const t = p.teamId || "UNASSIGNED";
    payroll[t] ??= Object.fromEntries(years.map(y => [y, 0]));

    for (const y of years) {
      payroll[t][y] += (p.salaryByYear?.[y] ?? 0);
    }
  }

  return payroll;
}