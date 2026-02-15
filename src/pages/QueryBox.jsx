// src/pages/QueryBox.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useLeague } from "../context/LeagueContext";

/* ----------------------------- utils (copied from TradeAnalyzer) ----------------------------- */

function normBasic(x) {
  return String(x ?? "").trim().toLowerCase();
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

/* ----------------------------- EXTRA FIELDS (same as TradeAnalyzer) ----------------------------- */

const EXTRA_FIELDS = {
  age: { header: ["Age Next offseason"], type: "text" },
  position: { header: ["Position"], type: "text" },
  games: { header: ["G"], type: "number" },
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

/* ----------------------------- Parse players from PlayerData table (copied) ----------------------------- */

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

/* ----------------------------- Custom dark dropdown (copied) ----------------------------- */

function DarkDropdown({ value, options, placeholder = "Select...", onChange }) {
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

/* ----------------------------- Preset helpers ----------------------------- */

function presetButtonClass(active = false) {
  return [
    "px-3 py-1.5 rounded-xl border text-sm font-semibold",
    active
      ? "bg-orange-500/15 border-orange-500/40 text-orange-200"
      : "bg-slate-950/25 border-slate-700/70 text-slate-200 hover:bg-slate-900/35",
  ].join(" ");
}

/* ----------------------------- Ironmen modes (your 2 ideas) ----------------------------- */
/**
 * Idea A: "Top 10% of games played"
 * - We compute a games threshold = 90th percentile among eligible players (after non-games filters),
 *   then we force minGames to that threshold.
 *
 * Idea B: "Closest to the games leader"
 * - We compute maxGames among eligible players, then show the 10–15 players with highest games (closest to max).
 * - This is done by overriding sorting to primary "games desc" and limiting Top N to 15.
 *
 * NOTE: Both ideas are applied AFTER we filter by team scope, age, salary, position, search (but BEFORE minGames),
 * because the whole point is to let "ironmen" determine the games filter.
 */

function percentile90(values) {
  const arr = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  // Nearest-rank percentile (90th)
  const idx = Math.max(0, Math.min(arr.length - 1, Math.ceil(0.9 * arr.length) - 1));
  return arr[idx];
}

/* ----------------------------- Page ----------------------------- */

export default function QueryBoxPage() {
  const { table, loading, error } = useLeague();

  const [loadError, setLoadError] = useState("");
  const [currentSeason, setCurrentSeason] = useState(null);
  const [players, setPlayers] = useState([]);

  const [teamInput, setTeamInput] = useState("");
  const [selectedTeams, setSelectedTeams] = useState([]);

  const defaultDraft = {
    minAge: 20,
    maxAge: "",
    minGames: "", // still available for manual use
    maxSalary: "",
    position: "",
    metric: "fpg",
    topN: 10,
    search: "",
    // ✅ NEW: ironmen mode ("" | "pct10" | "closestLeader")
    ironmenMode: "",
  };

  const [draft, setDraft] = useState(defaultDraft);

  const [applied, setApplied] = useState({
    teams: [],
    ...defaultDraft,
  });

  const [activePreset, setActivePreset] = useState("");

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
      const { players: parsedPlayers } = parsePlayersFromPlayerData({ headers, data });

      setCurrentSeason(season);
      setPlayers(parsedPlayers);
    } catch (e) {
      setLoadError(e?.message || "Failed to parse PlayerData");
    }
  }, [table, error]);

  const teamOptions = useMemo(() => {
    const teams = Array.from(new Set(players.map((p) => (p.teamId || "").trim()).filter(Boolean)));
    teams.sort((a, b) => a.localeCompare(b));
    return teams;
  }, [players]);

  function addTeam() {
    const t = String(teamInput || "").trim();
    if (!t) return;
    setSelectedTeams((prev) => {
      if (prev.includes(t)) return prev;
      if (prev.length >= 8) return prev;
      return [...prev, t];
    });
    setTeamInput("");
    setActivePreset("");
  }

  function removeTeam(t) {
    setSelectedTeams((prev) => prev.filter((x) => x !== t));
    setActivePreset("");
  }

  const metricLabel = useMemo(() => {
    return applied.metric === "fpts"
      ? "Fpts"
      : applied.metric === "fpg"
        ? "Fpts/G"
        : applied.metric === "fp$"
          ? "Fpts/$"
          : "Fpts/G/$";
  }, [applied.metric]);

  const metricValue = (p, metricKey) => {
    const fp = p?.fp || {};
    const k = metricKey || applied.metric;
    if (k === "fpts") return fp.fpts ?? 0;
    if (k === "fpg") return fp.fpg ?? 0;
    if (k === "fp$") return fp.fp$ ?? 0;
    return fp.fpg$ ?? 0;
  };

  // Base filter (used for both results + ironmen computations)
  function passNonGamesFilters(p, cfg, teams) {
    if (!p?.name) return false;

    if (teams.length > 0 && !teams.includes(p.teamId)) return false;

    const q = normBasic(cfg.search || "");
    if (q && !normBasic(p.name).includes(q)) return false;

    const posWanted = normBasic(cfg.position || "");
    if (posWanted) {
      const pos = normBasic(p.position || p.extras?.position || "");
      if (!pos.includes(posWanted)) return false;
    }

    const minA = Number(cfg.minAge || 0);
    const maxA = cfg.maxAge === "" ? null : Number(cfg.maxAge);
    const age = parseNumber(p.extras?.age);

    if (minA > 0 && age < minA) return false;
    if (maxA != null && age > maxA) return false;

    const maxSal = cfg.maxSalary === "" ? null : Number(cfg.maxSalary);
    if (maxSal != null && Number(p.salaryNow || 0) > maxSal) return false;

    return true;
  }

  // Compute ironmen derived params for the current applied config
  const ironmenInfo = useMemo(() => {
    const teams = applied.teams || [];
    const mode = applied.ironmenMode || "";
    if (!mode) return { mode: "", threshold: null, leader: null };

    const eligible = players.filter((p) => passNonGamesFilters(p, applied, teams));

    const gamesArr = eligible.map((p) => parseNumber(p.extras?.games)).filter((g) => Number.isFinite(g));

    if (!gamesArr.length) return { mode, threshold: 0, leader: 0 };

    const leader = Math.max(...gamesArr);

    if (mode === "pct10") {
      const threshold = percentile90(gamesArr);
      return { mode, threshold, leader };
    }

    if (mode === "closestLeader") {
      return { mode, threshold: null, leader };
    }

    return { mode: "", threshold: null, leader: null };
  }, [players, applied]);

  const results = useMemo(() => {
    const teams = applied.teams || [];

    // Manual min games only applies when NOT using ironmen modes
    const manualMinG = applied.minGames === "" ? null : Number(applied.minGames);

    const base = players.filter((p) => passNonGamesFilters(p, applied, teams));

    // Apply games logic
    let filtered = base;

    if (applied.ironmenMode === "pct10") {
      const thr = Number(ironmenInfo.threshold ?? 0);
      filtered = base.filter((p) => parseNumber(p.extras?.games) >= thr);
    } else if (applied.ironmenMode === "closestLeader") {
      // no threshold; we will sort by games desc and take top N later
      filtered = base.slice();
    } else {
      // normal manual min games
      if (manualMinG != null) filtered = base.filter((p) => parseNumber(p.extras?.games) >= manualMinG);
    }

    // Map
    const mapped = filtered.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      owner: p.teamId,
      position: p.position,
      age: parseNumber(p.extras?.age) || 0,
      games: parseNumber(p.extras?.games) || 0,
      salaryNow: Number(p.salaryNow || 0),
      metric: Number(metricValue(p, applied.metric) || 0),
    }));

    // Sort
    if (applied.ironmenMode === "closestLeader") {
      // primary sort by games (closest to leader), secondary by metric
      mapped.sort((a, b) => (b.games - a.games) || (b.metric - a.metric));
    } else {
      mapped.sort((a, b) => b.metric - a.metric);
    }

    // TopN (override for closestLeader to 15 if user picked less)
    let n = Math.max(1, Math.min(200, Number(applied.topN) || 10));
    if (applied.ironmenMode === "closestLeader") n = Math.max(n, 15); // “10–15 closest”: ensure at least 15
    return mapped.slice(0, n);
  }, [players, applied, ironmenInfo]);

  function runQuery(nextDraft = null, nextTeams = null) {
    const d = nextDraft || draft;
    const teams = Array.isArray(nextTeams) ? nextTeams : selectedTeams;
    setApplied({
      teams: teams.slice(),
      minAge: d.minAge,
      maxAge: d.maxAge,
      minGames: d.minGames,
      maxSalary: d.maxSalary,
      position: d.position,
      metric: d.metric,
      topN: d.topN,
      search: d.search,
      ironmenMode: d.ironmenMode || "",
    });
  }

  function resetAll() {
    setTeamInput("");
    setSelectedTeams([]);
    setDraft(defaultDraft);
    setApplied({ teams: [], ...defaultDraft });
    setActivePreset("");
  }

  // Presets (includes BOTH ironmen ideas)
  const presets = useMemo(
    () => [
      {
        id: "youngStars",
        name: "Young Stars",
        desc: "Age 20–24 • Fpts/G • Top 10",
        draft: { ...defaultDraft, minAge: 20, maxAge: 24, metric: "fpg", topN: 10, ironmenMode: "" },
      },
      {
        id: "ironmenPct",
        name: "Ironmen (Top 10% G)",
        desc: "Games threshold = 90th percentile (top 10% by G) • sorted by metric",
        draft: { ...defaultDraft, ironmenMode: "pct10", metric: "fpg", topN: 15, minGames: "" },
      },
      {
        id: "ironmenLeader",
        name: "Ironmen (Closest to Leader)",
        desc: "Find max G, then show ~15 players closest to it (sorted by G desc)",
        draft: { ...defaultDraft, ironmenMode: "closestLeader", metric: "fpg", topN: 15, minGames: "" },
      },
      {
        id: "cheapValue",
        name: "Cheap Value",
        desc: "Max salary 10M • Fpts/$ • Min G=20 • Top 15",
        draft: { ...defaultDraft, maxSalary: 10000000, minGames: 20, metric: "fp$", topN: 15, ironmenMode: "" },
      },
      {
        id: "superstars",
        name: "Superstars",
        desc: "Fpts (total) • Min G=40 • Top 10",
        draft: { ...defaultDraft, minGames: 40, metric: "fpts", topN: 10, ironmenMode: "" },
      },
      {
        id: "efficiency",
        name: "Efficiency Kings",
        desc: "Fpts/G/$ • Min G=30 • Top 15",
        draft: { ...defaultDraft, minGames: 30, metric: "fpg$", topN: 15, ironmenMode: "" },
      },
    ],
    []
  );

  function applyPreset(p) {
    setActivePreset(p.id);
    setDraft(p.draft);
    runQuery(p.draft, selectedTeams); // keep current team scope
  }

  const ironmenBanner = useMemo(() => {
    if (!applied.ironmenMode) return null;

    if (applied.ironmenMode === "pct10") {
      const thr = Number(ironmenInfo.threshold ?? 0);
      const lead = Number(ironmenInfo.leader ?? 0);
      return {
        title: "Ironmen mode: Top 10% by Games",
        body: `Threshold G ≥ ${thr} (leader has ${lead} games). Manual Min Games is ignored.`,
      };
    }

    if (applied.ironmenMode === "closestLeader") {
      const lead = Number(ironmenInfo.leader ?? 0);
      return {
        title: "Ironmen mode: Closest to Games Leader",
        body: `Leader has ${lead} games. Showing the ~15 closest by games played (sorted by G). Manual Min Games is ignored.`,
      };
    }

    return null;
  }, [applied.ironmenMode, ironmenInfo]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-2xl font-bold text-slate-100">QueryBox</div>
        <div className="mt-3 text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="text-2xl font-bold text-slate-100">QueryBox</div>
        <div className="mt-3 text-sm font-semibold text-red-400">Failed</div>
        <div className="mt-2 text-sm text-slate-300">{loadError}</div>
        <div className="mt-4 text-xs text-slate-500">
          Tip: QueryBox uses LeagueContext.table exactly like TradeAnalyzer.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-slate-100">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="text-2xl font-bold">QueryBox</div>
        <div className="text-sm text-slate-400 mt-1">
          When you have <span className="font-semibold">No Life</span>, you have <span className="font-semibold">Stats!</span>
        </div>
        <div className="text-xs text-slate-400 mt-2">
          Current season: <span className="font-semibold text-orange-300">{currentSeason}</span> • Players parsed:{" "}
          <span className="font-semibold text-slate-200">{players.length}</span>
        </div>

        {/* Presets */}
        <div className="mt-4">
          <div className="text-xs text-slate-400 mb-2">Presets</div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={presetButtonClass(activePreset === p.id)}
                title={p.desc}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Presets overwrite filters (not team scope) and automatically fetch the results.
          </div>
        </div>
      </div>

      {/* Ironmen banner */}
      {ironmenBanner && (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
          <div className="font-semibold text-orange-200">{ironmenBanner.title}</div>
          <div className="mt-1 text-sm text-orange-100/80">{ironmenBanner.body}</div>
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Teams scope */}
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="font-semibold">Team scope</div>
          <div className="text-xs text-slate-400 mt-1">Add up to 8 teams. If none selected → ALL players.</div>

          <div className="mt-3 flex gap-2 items-center">
            <div className="flex-1">
              <DarkDropdown value={teamInput} options={teamOptions} placeholder="Select team..." onChange={setTeamInput} />
            </div>

            <button
              onClick={addTeam}
              className="px-4 py-2 rounded-xl bg-slate-900/70 border border-slate-700/70 text-slate-100 hover:bg-slate-900"
            >
              Add
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {selectedTeams.length === 0 ? (
              <div className="text-sm text-slate-400">No teams selected.</div>
            ) : (
              selectedTeams.map((t) => (
                <div
                  key={t}
                  className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 bg-slate-900/30 border-slate-700/60"
                >
                  <div className="font-semibold text-slate-100 truncate">{t}</div>
                  <button
                    onClick={() => removeTeam(t)}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-700/70 bg-slate-950/30 hover:bg-slate-900/50"
                    title="Remove team"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4">
            <button
              onClick={resetAll}
              className="w-full px-4 py-2 rounded-xl bg-slate-950/30 border border-slate-700/70 text-slate-100 hover:bg-slate-900/40"
            >
              Reset all
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Filters</div>
            <div className="text-xs text-slate-400">
              Applied metric: <span className="font-semibold text-orange-300">{metricLabel}</span> • Results:{" "}
              <span className="font-semibold text-slate-200">{results.length}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-3">
              <div className="text-xs text-slate-400 mb-1">Min age</div>
              <input
                type="number"
                min={0}
                value={draft.minAge}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, minAge: e.target.value }));
                  setActivePreset("");
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-slate-400 mb-1">Max age</div>
              <input
                type="number"
                min={0}
                placeholder="(optional)"
                value={draft.maxAge}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, maxAge: e.target.value }));
                  setActivePreset("");
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-slate-400 mb-1">
                Min games (G) {draft.ironmenMode ? <span className="text-orange-300">(ignored in Ironmen modes)</span> : null}
              </div>
              <input
                type="number"
                min={0}
                placeholder="(optional)"
                value={draft.minGames}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, minGames: e.target.value }));
                  setActivePreset("");
                }}
                disabled={Boolean(draft.ironmenMode)}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-sm",
                  "bg-slate-900/30 border-slate-700/70 text-slate-100 placeholder:text-slate-400",
                  "focus:outline-none focus:ring-2 focus:ring-orange-500/30",
                  draft.ironmenMode ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-slate-400 mb-1">Max salary (salaryNow)</div>
              <input
                type="number"
                min={0}
                placeholder="e.g. 12 for 12m"
                value={draft.maxSalary}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, maxSalary: e.target.value }));
                  setActivePreset("");
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-slate-400 mb-1">Position</div>
              <select
                value={draft.position}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, position: e.target.value }));
                  setActivePreset("");
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                <option value="" className="bg-slate-950 text-slate-100">
                  Any
                </option>
                <option value="G" className="bg-slate-950 text-slate-100">
                  G
                </option>
                <option value="F" className="bg-slate-950 text-slate-100">
                  F
                </option>
                <option value="C" className="bg-slate-950 text-slate-100">
                  C
                </option>
                <option value="PG" className="bg-slate-950 text-slate-100">
                  PG
                </option>
                <option value="SG" className="bg-slate-950 text-slate-100">
                  SG
                </option>
                <option value="SF" className="bg-slate-950 text-slate-100">
                  SF
                </option>
                <option value="PF" className="bg-slate-950 text-slate-100">
                  PF
                </option>
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="text-xs text-slate-400 mb-1">Top N</div>
              <input
                type="number"
                min={1}
                max={200}
                value={draft.topN}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, topN: e.target.value }));
                  setActivePreset("");
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            <div className="md:col-span-6">
              <div className="text-xs text-slate-400 mb-1">Metric</div>
              <select
                value={draft.metric}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, metric: e.target.value }));
                  setActivePreset("");
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                <option value="fpg" className="bg-slate-950 text-slate-100">
                  Fpts/G
                </option>
                <option value="fpts" className="bg-slate-950 text-slate-100">
                  Fpts
                </option>
                <option value="fp$" className="bg-slate-950 text-slate-100">
                  Fpts/$
                </option>
                <option value="fpg$" className="bg-slate-950 text-slate-100">
                  Fpts/G/$
                </option>
              </select>
            </div>

            <div className="md:col-span-6">
              <div className="text-xs text-slate-400 mb-1">Search player</div>
              <input
                value={draft.search}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, search: e.target.value }));
                  setActivePreset("");
                }}
                placeholder="type part of a name…"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            {/* Ironmen mode selector (implements both ideas) */}
            <div className="md:col-span-12">
              <div className="text-xs text-slate-400 mb-1">Ironmen mode (optional)</div>
              <select
                value={draft.ironmenMode}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, ironmenMode: e.target.value }));
                  setActivePreset("");
                }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                <option value="" className="bg-slate-950 text-slate-100">
                  Off (use manual Min Games)
                </option>
                <option value="pct10" className="bg-slate-950 text-slate-100">
                  Top 10% of games played (90th percentile)
                </option>
                <option value="closestLeader" className="bg-slate-950 text-slate-100">
                  Closest to games leader (top ~15 by games)
                </option>
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                When Ironmen mode is ON, <span className="text-orange-300 font-semibold">Min Games is ignored</span>.
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setActivePreset("");
              runQuery();
            }}
            className="mt-5 w-full py-4 rounded-2xl font-bold tracking-wide text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-lg"
          >
            RUN QUERY
          </button>

          <div className="mt-2 text-xs text-slate-500">
            Top N = how many rows to return after sorting. In “Closest to Leader”, sorting becomes <span className="text-slate-300">Games desc</span>.
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="font-semibold">Results</div>
        <div className="text-xs text-slate-400 mt-1">
          Sorted by{" "}
          <span className="font-semibold text-orange-300">
            {applied.ironmenMode === "closestLeader" ? "Games (then metric)" : metricLabel}
          </span>{" "}
          • Showing <span className="font-semibold text-slate-200">{results.length}</span>.
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-800/70">
                <th className="py-2 pr-3 w-14">#</th>
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Owner</th>
                <th className="py-2 pr-3">Pos</th>
                <th className="py-2 pr-3">Age</th>
                <th className="py-2 pr-3">G</th>
                <th className="py-2 pr-3">Salary</th>
                <th className="py-2 pr-3">{metricLabel}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={`${r.playerId}-${idx}`} className="border-b border-slate-800/50 last:border-b-0">
                  <td className="py-2 pr-3 text-slate-400">{idx + 1}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-100">{r.name}</td>
                  <td className="py-2 pr-3 text-slate-200">{r.owner || "—"}</td>
                  <td className="py-2 pr-3 text-slate-300">{r.position || "—"}</td>
                  <td className="py-2 pr-3 text-slate-300">{r.age || "—"}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-200">{r.games || "—"}</td>
                  <td className="py-2 pr-3 text-slate-300">{formatMoney(r.salaryNow)}m</td>
                  <td className="py-2 pr-3 font-bold text-orange-200">
                    {formatFloat(r.metric, r.metric >= 10 ? 2 : 3)}
                  </td>
                </tr>
              ))}

              {results.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No results. Try clearing search/position, widening ages, or disabling Ironmen mode.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Age from <span className="font-semibold">Age Next offseason</span>.
        </div>
      </div>
    </div>
  );
}