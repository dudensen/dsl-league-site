// src/trade/buildTradeResult.js
function norm(x) { return String(x ?? "").trim().toLowerCase(); }

export function buildTradeResult({
  trade,                  // [{ teamId, receives: ["Player A", "Player B"] }, ...]
  players,
  years,
  cap = 200_000_000,
  teamPayrollByYear,      // from computeTeamPayrollByYear
  efficiencyYear = "2026" // salary year used for FP/$ and FP/G/$ checks if you need recompute
}) {
  const playerByName = new Map(players.map(p => [norm(p.name), p]));

  // Build moves: received players imply fromTeam (current owner) -> toTeam
  const moves = [];
  for (const entry of trade) {
    const toTeamId = entry.teamId;
    for (const nm of entry.receives) {
      const p = playerByName.get(norm(nm));
      if (!p) throw new Error(`Player not found in master: "${nm}"`);
      moves.push({ playerId: p.playerId, fromTeamId: p.teamId, toTeamId });
    }
  }

  // Initialize per team
  const teamIds = Array.from(new Set([
    ...Object.keys(teamPayrollByYear || {}),
    ...moves.flatMap(m => [m.fromTeamId, m.toTeamId])
  ]));

  const result = {};
  for (const teamId of teamIds) {
    result[teamId] = {
      teamId,
      incoming: [],
      outgoing: [],
      capByYear: Object.fromEntries(years.map(y => [y, { incoming: 0, outgoing: 0, net: 0, newPayroll: null, overCap: null }])),
      fp: {
        incoming: { fpG: 0, fp$: 0, fpG$: 0 },
        outgoing: { fpG: 0, fp$: 0, fpG$: 0 },
        net:      { fpG: 0, fp$: 0, fpG$: 0 }
      }
    };
  }

  // Fill incoming/outgoing lists
  for (const mv of moves) {
    const p = players.find(x => x.playerId === mv.playerId);
    result[mv.toTeamId]?.incoming.push(p);
    result[mv.fromTeamId]?.outgoing.push(p);
  }

  // Cap impact
  for (const teamId of Object.keys(result)) {
    const r = result[teamId];
    for (const y of years) {
      const incoming = r.incoming.reduce((s, p) => s + (p.salaryByYear?.[y] ?? 0), 0);
      const outgoing = r.outgoing.reduce((s, p) => s + (p.salaryByYear?.[y] ?? 0), 0);
      const net = incoming - outgoing;

      const cell = r.capByYear[y];
      cell.incoming = incoming;
      cell.outgoing = outgoing;
      cell.net = net;

      if (teamPayrollByYear?.[teamId]?.[y] != null) {
        cell.newPayroll = teamPayrollByYear[teamId][y] + net;
        cell.overCap = cell.newPayroll > cap;
      }
    }
  }

  // FP metrics gained (use what your sheet already calculates)
  function aggFp(arr) {
    return arr.reduce((acc, p) => {
      acc.fpG  += (p.stats?.fpPerGame ?? 0);
      acc.fp$  += (p.stats?.fpPerDollar ?? 0);
      acc.fpG$ += (p.stats?.fpPerGamePerDollar ?? 0);
      return acc;
    }, { fpG: 0, fp$: 0, fpG$: 0 });
  }

  for (const teamId of Object.keys(result)) {
    const r = result[teamId];
    r.fp.incoming = aggFp(r.incoming);
    r.fp.outgoing = aggFp(r.outgoing);
    r.fp.net = {
      fpG:  r.fp.incoming.fpG  - r.fp.outgoing.fpG,
      fp$:  r.fp.incoming.fp$  - r.fp.outgoing.fp$,
      fpG$: r.fp.incoming.fpG$ - r.fp.outgoing.fpG$
    };
  }

  return { moves, teams: Object.values(result) };
}