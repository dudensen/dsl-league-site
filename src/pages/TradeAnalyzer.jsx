// src/pages/TradeAnalyzer.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useLeague } from "../context/LeagueContext";

/* ----------------------------- utils ----------------------------- */

function normBasic(x) {
  return String(x ?? "").trim().toLowerCase();
}

function normFuzzy(x) {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’'".,()/\\\-_:;!?]+/g, "");
}

function parseNumber(x) {
  if (x == null || x === "") return 0;
  const s = String(x).replace(/[,€$]/g, "").replace(/m/gi, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatFloat(n, digits = 3) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function statPillClass(v) {
  if (v > 0) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (v < 0) return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-slate-700/70 bg-slate-950/20 text-slate-200";
}

/* ----------------------------- EXTRA FIELDS (safe add) ----------------------------- */
/**
 * Add more columns here. We resolve keys from PlayerData headers (unique),
 * then store values under p.extras.<field>.
 */
const EXTRA_FIELDS = {
  // show as text
  age: { header: ["Age Next offseason"], type: "text" },
  position: { header: ["Position"], type: "text" },

  // parse as number
  games: { header: ["G"], type: "number" },

  // salary-like parsing (ONLY if you want to use an explicit "Current Salary" column)
  // NOTE: your "salaryNow" for display is taken from the currentSeason year column, not this.
  salaryNow: { header: ["Current Salary", "Salary"], type: "money" },
};

function pickHeaderKey(headers, wanted) {
  const list = Array.isArray(wanted) ? wanted : [wanted];
  for (const w of list) {
    const exact = (headers || []).find((h) => String(h).trim() === String(w).trim());
    if (exact) return exact;
    const fuzzy = (headers || []).find((h) => normBasic(h) === normBasic(w));
    if (fuzzy) return fuzzy;
  }
  return null;
}

function getRowValue(row, key) {
  if (!row || !key) return "";
  return row[key];
}

/* ----------------------------- Season logic (from headers) ----------------------------- */

function deduceCurrentSeasonFromHeaders(headers) {
  let lastRankYear = null;
  for (const h of headers || []) {
    const m = String(h).trim().match(/^(\d{4})\s+Rank$/i);
    if (m) {
      const y = Number(m[1]);
      if (!Number.isNaN(y)) lastRankYear = lastRankYear == null ? y : Math.max(lastRankYear, y);
    }
  }
  return lastRankYear == null ? new Date().getFullYear() : lastRankYear + 1;
}

/* ----------------------------- Salary year extraction (unique headers) ----------------------------- */

function findHeaderIndex(headers, label) {
  const target = normBasic(label);
  return (headers || []).findIndex((h) => normBasic(h) === target);
}

function extractSalaryBlockYears(headers) {
  const h = headers || [];

  const contractIdx =
    findHeaderIndex(h, "Contract Years (next season)") !== -1
      ? findHeaderIndex(h, "Contract Years (next season)")
      : findHeaderIndex(h, "Contract Years") !== -1
        ? findHeaderIndex(h, "Contract Years")
        : -1;

  const years = [];
  const idxByYear = {};

  // Fallback: first occurrence of exact YYYY
  if (contractIdx === -1) {
    for (let i = 0; i < h.length; i++) {
      const m = String(h[i]).trim().match(/^(\d{4})$/);
      if (!m) continue;
      const y = m[1];
      if (!idxByYear[y]) {
        idxByYear[y] = i;
        years.push(y);
      }
    }
    years.sort((a, b) => Number(a) - Number(b));
    return { years, salaryIdxByYear: idxByYear };
  }

  // Salary block scanning after contract column
  let misses = 0;
  for (let i = contractIdx + 1; i < h.length; i++) {
    const m = String(h[i]).trim().match(/^(\d{4})$/);
    if (m) {
      const y = m[1];
      years.push(y);
      idxByYear[y] = i;
      misses = 0;
    } else {
      misses++;
      if (misses >= 6 && years.length > 0) break;
    }
  }

  years.sort((a, b) => Number(a) - Number(b));
  return { years, salaryIdxByYear: idxByYear };
}

/* ----------------------------- Parse players from PlayerData table ----------------------------- */

function parsePlayersFromPlayerData({ headers, data }) {
  const iPlayerKey = (headers || []).find((h) => normBasic(h) === "player") || "Player";
  const iOwnerKey = (headers || []).find((h) => normBasic(h) === "current owner") || "Current Owner";
  const iPosKey = (headers || []).find((h) => normBasic(h) === "position") || "Position";

  if (!headers?.includes(iPlayerKey)) throw new Error("PlayerData: 'Player' header not found");
  if (!headers?.includes(iOwnerKey)) throw new Error("PlayerData: 'Current Owner' header not found");

  const { years, salaryIdxByYear } = extractSalaryBlockYears(headers);

  // current season (ex: 2026) — used for salaryNow
  const season = deduceCurrentSeasonFromHeaders(headers);
  const seasonKey = String(season);

  // FP metrics: exact generic headers only (DO NOT CHANGE)
  const fpKey = (headers || []).find((h) => String(h).trim() === "Fpts");
  const fpgKey = (headers || []).find((h) => String(h).trim() === "Fpts/G");
  const fpDollarKey = (headers || []).find((h) => String(h).trim() === "Fpts/$");
  const fpgDollarKey = (headers || []).find((h) => String(h).trim() === "Fpts/G/$");

  // Fantrax code
  const fantraxKey = (headers || []).slice().reverse().find((h) => normBasic(h) === "fantrax code");

  // Resolve extra columns once (safe even if some are missing)
  const extraKeys = {};
  for (const [field, spec] of Object.entries(EXTRA_FIELDS)) {
    extraKeys[field] = pickHeaderKey(headers, spec.header);
  }

  const players = [];

  for (let r = 0; r < (data || []).length; r++) {
    const row = data[r] || {};
    const name = String(row[iPlayerKey] ?? "").trim();
    if (!name) continue;

    const teamId = String(row[iOwnerKey] ?? "").trim();
    const position = iPosKey && row[iPosKey] != null ? String(row[iPosKey] ?? "").trim() : "";

    // Salary by year (from salary block)
    const salaryByYear = {};
    for (const y of years) {
      const idx = salaryIdxByYear[y];
      const headerAtIdx = idx != null ? headers[idx] : null;
      salaryByYear[y] = headerAtIdx ? parseNumber(row[headerAtIdx]) : 0;
    }

    // ✅ salaryNow = salary for currentSeason (ex: "2026") from salaryByYear
    const salaryNow = salaryByYear?.[seasonKey] ?? 0;

    const fpts = fpKey ? parseNumber(row[fpKey]) : 0;
    const fpg = fpgKey ? parseNumber(row[fpgKey]) : 0;
    const fp$ = fpDollarKey ? parseNumber(row[fpDollarKey]) : 0;
    const fpg$ = fpgDollarKey ? parseNumber(row[fpgDollarKey]) : 0;

    const playerIdRaw = fantraxKey ? String(row[fantraxKey] ?? "").trim() : "";
    const playerId = playerIdRaw ? playerIdRaw : `row-${r + 1}`;

    const extras = {};
    for (const [field, spec] of Object.entries(EXTRA_FIELDS)) {
      const key = extraKeys[field];
      const raw = getRowValue(row, key);
      if (spec.type === "number") extras[field] = parseNumber(raw);
      else if (spec.type === "money") extras[field] = parseNumber(raw);
      else extras[field] = String(raw ?? "").trim();
    }

    players.push({
      playerId,
      name,
      teamId,
      position,
      salaryByYear,
      salaryNow,
      fp: { fpts, fpg, fp$, fpg$ },
      extras,
    });
  }

  return { players, salaryYears: years };
}

/* ----------------------------- Trade calculations ----------------------------- */

function buildTradeResult({ tradeMap, players, yearsSelected }) {
  const byName = new Map(players.map((p) => [normFuzzy(p.name), p]));
  const playerById = new Map(players.map((p) => [p.playerId, p]));

  const moves = [];
  const missing = [];

  for (const [toTeamId, receives] of Object.entries(tradeMap)) {
    for (const raw of receives) {
      const p = byName.get(normFuzzy(raw));
      if (!p) {
        missing.push({ teamId: toTeamId, name: raw });
        continue;
      }
      moves.push({ playerId: p.playerId, name: p.name, fromTeamId: p.teamId, toTeamId });
    }
  }

  const touchedTeams = Array.from(new Set(moves.flatMap((m) => [m.fromTeamId, m.toTeamId])));

  const byTeam = {};
  for (const t of touchedTeams) {
    byTeam[t] = {
      teamId: t,
      incoming: [],
      outgoing: [],
      salaryImpactByYear: Object.fromEntries(yearsSelected.map((y) => [y, 0])),

      fpIncoming: { fpts: 0, fpg: 0, fp$: 0, fpg$: 0 },
      fpOutgoing: { fpts: 0, fpg: 0, fp$: 0, fpg$: 0 },
      fpNet: { fpts: 0, fpg: 0, fp$: 0, fpg$: 0 },
    };
  }

  for (const mv of moves) {
    const p = playerById.get(mv.playerId);
    if (!p) continue;
    byTeam[mv.toTeamId]?.incoming.push(p);
    byTeam[mv.fromTeamId]?.outgoing.push(p);
  }

  for (const t of Object.keys(byTeam)) {
    const r = byTeam[t];

    for (const y of yearsSelected) {
      const inc = r.incoming.reduce((s, p) => s + (p.salaryByYear?.[y] ?? 0), 0);
      const out = r.outgoing.reduce((s, p) => s + (p.salaryByYear?.[y] ?? 0), 0);
      r.salaryImpactByYear[y] = inc - out;
    }

    const sumFp = (arr) =>
      arr.reduce(
        (acc, p) => {
          acc.fpts += p.fp?.fpts ?? 0;
          acc.fpg += p.fp?.fpg ?? 0;
          acc.fp$ += p.fp?.fp$ ?? 0;
          acc.fpg$ += p.fp?.fpg$ ?? 0;
          return acc;
        },
        { fpts: 0, fpg: 0, fp$: 0, fpg$: 0 }
      );

    r.fpIncoming = sumFp(r.incoming);
    r.fpOutgoing = sumFp(r.outgoing);
    r.fpNet = {
      fpts: r.fpIncoming.fpts - r.fpOutgoing.fpts,
      fpg: r.fpIncoming.fpg - r.fpOutgoing.fpg,
      fp$: r.fpIncoming.fp$ - r.fpOutgoing.fp$,
      fpg$: r.fpIncoming.fpg$ - r.fpOutgoing.fpg$,
    };
  }

  const teams = Object.values(byTeam).sort((a, b) => a.teamId.localeCompare(b.teamId));
  return { moves, missing, teams };
}

/* ----------------------------- Custom dark dropdown ----------------------------- */

function DarkDropdown({ value, options, placeholder = "Select team...", onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={[
          "w-full text-left rounded-xl px-3 py-2 text-sm",
          "bg-slate-900/40 border border-slate-700/70",
          "text-slate-100 shadow-inner",
          "hover:border-slate-500 focus:outline-none",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <span className={value ? "text-slate-100" : "text-slate-400"}>{value || placeholder}</span>
          <span className="text-slate-400">▾</span>
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-700/70 bg-slate-950/95 backdrop-blur shadow-xl overflow-hidden">
          <div className="max-h-72 overflow-auto">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={[
                  "w-full text-left px-3 py-2 text-sm",
                  "text-slate-100 hover:bg-slate-800/60",
                  value === opt ? "bg-slate-800/60" : "",
                ].join(" ")}
              >
                <span className="font-medium">{opt}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Page ----------------------------- */

export default function TradeAnalyzerPage() {
  const { table, loading, error } = useLeague();

  const [loadError, setLoadError] = useState("");

  const [currentSeason, setCurrentSeason] = useState(null);

  const [players, setPlayers] = useState([]);
  const [allSalaryYears, setAllSalaryYears] = useState([]);
  const [yearsSelected, setYearsSelected] = useState([]);

  const [tradeMap, setTradeMap] = useState({});
  const [activeTeam, setActiveTeam] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");

  const [result, setResult] = useState(null);

  // OPTIONAL: cap space reference (populate this from TeamDetails/LeagueContext when you’re ready)
  const capSpaceByTeam = table?.capSpaceByTeam || {};

  useEffect(() => {
    try {
      setLoadError("");
      if (error) {
        setLoadError(String(error));
        return;
      }

      const headers = table?.headers || [];
      const data = table?.data || [];
      if (!headers.length) {
        setLoadError("No headers found in LeagueContext table.");
        return;
      }

      const season = deduceCurrentSeasonFromHeaders(headers);
      const { players: parsedPlayers, salaryYears } = parsePlayersFromPlayerData({ headers, data });

      const filteredYears = salaryYears.filter((y) => Number(y) >= Number(season));
      const defaultSelected = filteredYears.slice(0, 5);

      setCurrentSeason(season);
      setPlayers(parsedPlayers);
      setAllSalaryYears(filteredYears);
      setYearsSelected(defaultSelected.length ? defaultSelected : filteredYears);
    } catch (e) {
      setLoadError(e?.message || "Failed to parse PlayerData");
    }
  }, [table, error]);

  const teamOptions = useMemo(() => {
    const teams = Array.from(new Set(players.map((p) => (p.teamId || "").trim()).filter(Boolean)));
    teams.sort((a, b) => a.localeCompare(b));
    return teams;
  }, [players]);

  const selectedTeams = useMemo(() => Object.keys(tradeMap), [tradeMap]);

  // IMPORTANT: now we keep owner label with each player option
  const availablePlayers = useMemo(() => {
    if (selectedTeams.length === 0) return [];
    const out = [];
    for (const p of players) {
      if (selectedTeams.includes(p.teamId)) out.push({ name: p.name, owner: p.teamId });
    }
    // de-dupe by name (keep first)
    const seen = new Set();
    const deduped = [];
    for (const x of out) {
      const k = normFuzzy(x.name);
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(x);
    }
    deduped.sort((a, b) => a.name.localeCompare(b.name));
    return deduped;
  }, [players, selectedTeams]);

  const filteredPlayers = useMemo(() => {
    const q = normBasic(playerQuery);
    const base = availablePlayers;
    if (!q) return base.slice(0, 40);
    return base.filter((x) => normBasic(x.name).includes(q)).slice(0, 40);
  }, [playerQuery, availablePlayers]);

  // handy map to show salaryNow + extras in the picker
  const playerByName = useMemo(() => {
    const m = new Map();
    for (const p of players) m.set(normFuzzy(p.name), p);
    return m;
  }, [players]);

  function ensureTeam(teamId) {
    const t = String(teamId || "").trim();
    if (!t) return;
    setTradeMap((prev) => (prev[t] ? prev : { ...prev, [t]: [] }));
    setActiveTeam(t);
  }

  function addTeamFromPicker() {
    const t = String(teamInput || "").trim();
    if (!t) return;
    ensureTeam(t);
    setTeamInput("");
  }

  function addReceive(teamId, name) {
    const nm = String(name || "").trim();
    if (!teamId || !nm) return;
    setTradeMap((prev) => {
      const cur = prev[teamId] ?? [];
      if (cur.some((x) => normFuzzy(x) === normFuzzy(nm))) return prev;
      return { ...prev, [teamId]: [...cur, nm] };
    });
    setPlayerQuery("");
  }

  function removeReceive(teamId, name) {
    setTradeMap((prev) => {
      const cur = prev[teamId] ?? [];
      return { ...prev, [teamId]: cur.filter((x) => x !== name) };
    });
  }

  function removeTeam(teamId) {
    setTradeMap((prev) => {
      const { [teamId]: _, ...rest } = prev;
      return rest;
    });
    setActiveTeam((t) => (t === teamId ? "" : t));
  }

  function runAnalysis() {
    const out = buildTradeResult({
      tradeMap: Object.fromEntries(Object.entries(tradeMap).filter(([, v]) => Array.isArray(v) && v.length)),
      players,
      yearsSelected,
    });
    setResult(out);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-2xl font-bold text-slate-100">Trade Analyzer</div>
        <div className="mt-3 text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="text-2xl font-bold text-slate-100">Trade Analyzer</div>
        <div className="mt-3 text-sm font-semibold text-red-400">Failed</div>
        <div className="mt-2 text-sm text-slate-300">{loadError}</div>
        <div className="mt-4 text-xs text-slate-500">Tip: fix LeagueContext table load / headers mapping.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-slate-100">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="text-2xl font-bold">Trade Analyzer</div>
        
        <div className="text-xs text-slate-400 mt-2">
          Current season: <span className="font-semibold text-orange-300">{currentSeason}</span>
        </div>
      </div>

      {/* Years + big button */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Cap years</div>
            <div className="text-xs text-slate-400">Salary years ≥ current season</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {allSalaryYears.map((y) => {
              const selected = yearsSelected.includes(y);
              return (
                <button
                  key={y}
                  onClick={() => {
                    setYearsSelected((prev) => {
                      const next = prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y];
                      next.sort((a, b) => Number(a) - Number(b));
                      return next;
                    });
                  }}
                  className={[
                    "px-3 py-1.5 rounded-xl border text-sm",
                    selected
                      ? "bg-slate-900/70 text-slate-100 border-slate-500"
                      : "bg-slate-950/30 hover:bg-gray-900/40 border-slate-700/70 text-slate-200",
                  ].join(" ")}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={runAnalysis}
          className="mt-5 w-full py-4 rounded-2xl font-bold tracking-wide text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-lg"
        >
          ANALYZE TRADE
        </button>
      </div>

      {/* Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Teams */}
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="font-semibold">Teams in this trade</div>
          <div className="text-sm text-slate-400 mt-1">
          Add teams → pick active team → add incoming player.
          </div>

          <div className="mt-3 flex gap-2 items-center">
            <div className="flex-1">
              <DarkDropdown
                value={teamInput}
                options={teamOptions}
                placeholder="Select team..."
                onChange={(v) => setTeamInput(v)}
              />
            </div>

            <button
              onClick={addTeamFromPicker}
              className="px-4 py-2 rounded-xl bg-slate-900/70 border border-slate-700/70 text-slate-100 hover:bg-slate-900"
            >
              Add
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {Object.keys(tradeMap).length === 0 && (
              <div className="text-sm text-slate-400">Add a team, then add received players.</div>
            )}

            {Object.keys(tradeMap)
              .sort((a, b) => a.localeCompare(b))
              .map((t) => {
                const cap = capSpaceByTeam?.[t];
                const capNum = typeof cap === "number" ? cap : cap != null ? parseNumber(cap) : null;

                return (
                  <div
                    key={t}
                    className={[
                      "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 cursor-pointer",
                      "bg-slate-900/30 border-slate-700/60 hover:bg-slate-900/40",
                      activeTeam === t ? "ring-2 ring-orange-500/40 border-orange-500/40" : "",
                    ].join(" ")}
                    onClick={() => setActiveTeam(t)}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">{t}</div>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <div className="text-xs text-slate-400">
                          Receives: <span className="font-semibold text-slate-200">{(tradeMap[t] ?? []).length}</span>
                        </div>

                        {capNum != null && !Number.isNaN(capNum) && (
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/30 px-2.5 py-1 text-[11px]">
                            <span className="text-slate-400">Cap Space</span>
                            <span className={capNum >= 0 ? "font-bold text-emerald-300" : "font-bold text-red-300"}>
                              {capNum >= 0 ? "+" : ""}
                              {formatMoney(capNum)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTeam(t);
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-slate-700/70 bg-slate-950/30 hover:bg-slate-900/50"
                      title="Remove team"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
          </div>

          {Object.keys(tradeMap).length > 0 && Object.keys(capSpaceByTeam || {}).length === 0 && (
            <div className="mt-3 text-[11px] text-slate-500">
              (Cap Space reference will appear here once you expose{" "}
              <span className="font-semibold">table.capSpaceByTeam</span>.)
            </div>
          )}
        </div>

        {/* Receives */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Team receives</div>
            <div className="text-xs text-slate-400">
              Active: <span className="font-semibold text-slate-200">{activeTeam || "—"}</span>
            </div>
          </div>

          {!activeTeam ? (
            <div className="mt-4 text-sm text-slate-400">Select a team on the left to add received players.</div>
          ) : (
            <>
              {/* Receives list */}
              <div className="mt-4">
                <div className="text-sm font-semibold text-orange-300">Receives list</div>

                <div className="mt-2 space-y-2">
                  {(tradeMap[activeTeam] ?? []).map((n) => {
                  const p = playerByName.get(normFuzzy(n));
                  const salaryNowText =
                    p && typeof p.salaryNow === "number" && p.salaryNow > 0 ? formatMoney(p.salaryNow) : "";
                  const ageText = p?.extras?.age ? String(p.extras.age) : "";
                  const nbaTeamText = p?.extras?.nbaTeam ? String(p.extras.nbaTeam) : "";

                  return (
                    <div
                      key={n}
                      className="flex items-center justify-between gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-base font-bold text-slate-100">{n}</div>

                        {(salaryNowText || ageText || nbaTeamText) && (
                          <div className="mt-1 text-[11px] text-slate-300/80 flex flex-wrap gap-x-3 gap-y-1">
                            {salaryNowText ? <span>Salary: {salaryNowText}</span> : null}
                            {ageText ? <span>Age: {ageText}</span> : null}
                            {nbaTeamText ? <span>NBA: {nbaTeamText}</span> : null}
                          </div>
                        )}

                        <div className="text-xs text-slate-300/80 mt-1">Added to trade</div>
                      </div>

                      <button
                        onClick={() => removeReceive(activeTeam, n)}
                        className="text-xs px-2 py-1 rounded-lg border border-slate-700/70 bg-slate-950/30 hover:bg-slate-900/50"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                </div>
              </div>

              <div className="mt-4">
                <input
                  value={playerQuery}
                  onChange={(e) => setPlayerQuery(e.target.value)}
                  placeholder="Search players (from selected teams rosters)..."
                  className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredPlayers.map(({ name, owner }) => {
                  const p = playerByName.get(normFuzzy(name));
                  const nbaTeam = p?.extras?.nbaTeam ? String(p.extras.nbaTeam) : "";
                  const age = p?.extras?.age ? String(p.extras.age) : "";
                  const salaryNow = p?.salaryNow ? formatMoney(p.salaryNow) : "";

                  return (
                    <button
                      key={`${name}-${owner}`}
                      onClick={() => addReceive(activeTeam, name)}
                      className="text-left rounded-xl border border-slate-700/60 bg-slate-900/20 px-4 py-3 text-sm hover:bg-slate-900/35"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-slate-100">{name}</div>
                        <span className="shrink-0 inline-flex items-center rounded-full border border-slate-700/70 bg-slate-950/30 px-2 py-0.5 text-[11px] text-slate-300">
                          {owner || "—"}
                        </span>
                      </div>

                      {(nbaTeam || salaryNow || age) && (
                        <div className="mt-1 text-[11px] text-slate-400">
                          {nbaTeam ? <span className="mr-2">NBA: {nbaTeam}</span> : null}
                          {salaryNow ? <span className="mr-2">Salary: {salaryNow}m</span> : null}
                          {age ? <span>Age: {age}</span> : null}
                        </div>
                      )}

                      <div className="text-xs text-slate-400 mt-1">Click to add</div>
                    </button>
                  );
                })}

                {selectedTeams.length > 0 && filteredPlayers.length === 0 && (
                  <div className="text-sm text-slate-400 col-span-full">No matches. Try a different search.</div>
                )}

                {selectedTeams.length === 0 && (
                  <div className="text-sm text-slate-400 col-span-full">
                    Add teams first — available players are pulled from selected teams’ rosters.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="font-semibold">Results</div>

        {!result ? (
          <div className="mt-3 text-sm text-slate-400">Click “ANALYZE TRADE” to generate results.</div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Missing */}
            {result.missing?.length > 0 && (
              <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
                <div className="font-semibold text-orange-200">Some assets weren’t found</div>
                <div className="text-sm text-orange-200/80 mt-2">These were skipped:</div>
                <ul className="list-disc pl-5 mt-2 text-sm text-orange-200/90">
                  {result.missing.map((m, idx) => (
                    <li key={`${m.teamId}-${m.name}-${idx}`}>
                      <span className="font-semibold">{m.teamId}</span> receives: {m.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

 {/* Moves */}
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-4">
              <div className="font-semibold">Trade Analysis</div>
              <div className="text-xs text-slate-400 mt-1"></div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[700px] w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-800/70">
                      <th className="py-2 pr-3">Player</th>
                      <th className="py-2 pr-3">From</th>
                      <th className="py-2 pr-3">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.moves.map((m) => (
                      <tr key={`${m.playerId}-${m.toTeamId}`} className="border-b border-slate-800/50 last:border-b-0">
                        <td className="py-2 pr-3">{m.name}</td>
                        <td className="py-2 pr-3">{m.fromTeamId}</td>
                        <td className="py-2 pr-3">{m.toTeamId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>


            {/* Salary Impact */}
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-4">
              <div className="font-semibold">Salary Impact</div>
              <div className="text-xs text-slate-400 mt-1">
                Per team, per year: (incoming salaries − outgoing salaries). Green = positive, Red = negative.
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-800/70">
                      <th className="py-2 pr-3">Team</th>
                      {yearsSelected.map((y) => (
                        <th key={y} className="py-2 pr-3">
                          {y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.teams.map((t) => (
                      <tr key={t.teamId} className="border-b border-slate-800/50 last:border-b-0">
                        <td className="py-2 pr-3 font-semibold">{t.teamId}</td>
                        {yearsSelected.map((y) => {
                          const v = t.salaryImpactByYear[y] ?? 0;
                          const cls = v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "text-slate-300";
                          return (
                            <td key={`${t.teamId}-${y}`} className={`py-2 pr-3 ${cls}`}>
                              {v > 0 ? "+" : ""}
                              {formatMoney(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FP Impact */}
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-4">
              <div className="font-semibold">FP Impact</div>
              <div className="text-xs text-slate-400 mt-1">
                Showing each moved player and their <span className="font-semibold">Fpts</span>,{" "}
                <span className="font-semibold">Fpts/G</span>, <span className="font-semibold">Fpts/$</span>,{" "}
                <span className="font-semibold">Fpts/G/$</span>. Net = incoming − outgoing.
              </div>

              <div className="mt-3 space-y-4">
                {result.teams.map((t) => (
                  <div key={`fp-${t.teamId}`} className="rounded-2xl border border-slate-800/70 bg-slate-950/15 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">{t.teamId}</div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1",
                            statPillClass(t.fpNet.fpts),
                          ].join(" ")}
                        >
                          <span className="text-slate-300">Net Fpts</span>
                          <span className="font-bold">
                            {t.fpNet.fpts >= 0 ? "+" : ""}
                            {formatFloat(t.fpNet.fpts, 3)}
                          </span>
                        </span>

                        <span
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1",
                            statPillClass(t.fpNet.fpg),
                          ].join(" ")}
                        >
                          <span className="text-slate-300">Net Fpts/G</span>
                          <span className="font-bold">
                            {t.fpNet.fpg >= 0 ? "+" : ""}
                            {formatFloat(t.fpNet.fpg, 3)}
                          </span>
                        </span>

                        <span
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1",
                            statPillClass(t.fpNet.fp$),
                          ].join(" ")}
                        >
                          <span className="text-slate-300">Net Fpts/$</span>
                          <span className="font-bold">
                            {t.fpNet.fp$ >= 0 ? "+" : ""}
                            {formatFloat(t.fpNet.fp$, 6)}
                          </span>
                        </span>

                        <span
                          className={[
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1",
                            statPillClass(t.fpNet.fpg$),
                          ].join(" ")}
                        >
                          <span className="text-slate-300">Net Fpts/G/$</span>
                          <span className="font-bold">
                            {t.fpNet.fpg$ >= 0 ? "+" : ""}
                            {formatFloat(t.fpNet.fpg$, 6)}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-[780px] w-full text-sm">
                        <thead>
                          <tr className="text-left border-b border-slate-800/70">
                            <th className="py-2 pr-3">Direction</th>
                            <th className="py-2 pr-3">Player</th>
                            <th className="py-2 pr-3">Fpts</th>
                            <th className="py-2 pr-3">Fpts/G</th>
                            <th className="py-2 pr-3">Fpts/$</th>
                            <th className="py-2 pr-3">Fpts/G/$</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ...t.incoming.map((p) => ({ p, dir: "Incoming" })),
                            ...t.outgoing.map((p) => ({ p, dir: "Outgoing" })),
                          ].map(({ p, dir }) => {
                            const isIn = dir === "Incoming";
                            const rowTone = isIn ? "text-emerald-100" : "text-red-100";
                            const badge = isIn
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : "border-red-500/30 bg-red-500/10 text-red-200";

                            return (
                              <tr
                                key={`${dir}-${t.teamId}-${p.playerId}`}
                                className="border-b border-slate-800/50 last:border-b-0"
                              >
                                <td className="py-2 pr-3">
                                  <span className={["inline-flex rounded-full border px-2.5 py-1 text-xs", badge].join(" ")}>
                                    {dir}
                                  </span>
                                </td>
                                <td className={["py-2 pr-3 font-semibold", rowTone].join(" ")}>{p.name}</td>

                                <td className="py-2 pr-3">{formatFloat(p.fp?.fpts ?? 0, 3)}</td>
                                <td className="py-2 pr-3">{formatFloat(p.fp?.fpg ?? 0, 3)}</td>
                                <td className="py-2 pr-3">{formatFloat(p.fp?.fp$ ?? 0, 6)}</td>
                                <td className="py-2 pr-3">{formatFloat(p.fp?.fpg$ ?? 0, 6)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>

           
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Source: Fpts/G, Fpts/$,
        Fpts/G/$.
      </div>
    </div>
  );
}