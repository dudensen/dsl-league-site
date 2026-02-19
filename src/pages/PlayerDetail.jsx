// src/pages/PlayerDetail.jsx
import { useLeague } from "../context/LeagueContext"
import { useParams, Link } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts"
import { fetchTransactionsRows } from "../utils/fetchTransactions"

export default function PlayerDetail() {
  const { table, loading, error } = useLeague()
  const { playerName } = useParams()

  const BOTTOM_RANK = 459 // league bottom rank for DNP seasons
  const decodedPlayer = decodeURIComponent(playerName)
  const { data = [] } = table

  const startYear = 2020
  const currentYear = new Date().getFullYear()
  const MAX_COMPARE = 5

  // ✅ independent compare slots per chart
  const [rankCompareNames, setRankCompareNames] = useState(
    Array(MAX_COMPARE).fill("")
  )
  const [fptsCompareNames, setFptsCompareNames] = useState(
    Array(MAX_COMPARE).fill("")
  )
  const [salaryCompareNames, setSalaryCompareNames] = useState(
    Array(MAX_COMPARE).fill("")
  )

  // ✅ Transactions (local fetch, no LeagueContext changes)
  const [txRows, setTxRows] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [txError, setTxError] = useState(null)

  useEffect(() => {
    let alive = true
    async function loadTx() {
      try {
        setTxLoading(true)
        setTxError(null)
        const rows = await fetchTransactionsRows()
        if (!alive) return
        setTxRows(rows)
      } catch (e) {
        if (!alive) return
        setTxError(e?.message || String(e))
      } finally {
        if (!alive) return
        setTxLoading(false)
      }
    }
    loadTx()
    return () => {
      alive = false
    }
  }, [])

  const LINE_COLORS = [
    "#f97316", // main (orange)
    "#22c55e", // green
    "#3b82f6", // blue
    "#a855f7", // purple
    "#ef4444", // red
    "#06b6d4" // cyan
  ]

  const normName = s =>
    String(s ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()

  // stronger normalization for transaction matching
  const normFuzzy = s =>
    String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[’'".,()/\\\-_:;!?]+/g, "")

  const toNumberOrNull = v => {
    const s = String(v ?? "")
      .replace("\r", "")
      .replace(/,/g, "")
      .trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  const toIntOrNull = v => {
    const s = String(v ?? "")
      .replace("\r", "")
      .replace(/,/g, "")
      .trim()
    if (!s) return null
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  }

  const toSalaryOrNull = v => {
    const s = String(v ?? "")
      .replace("\r", "")
      .replace(/\$/g, "")
      .replace(/m/gi, "")
      .replace(/,/g, "")
      .trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  const getRowByPlayerName = name => {
    const target = normName(name)
    if (!target) return null
    return data.find(r => normName(r["Player"]) === target) || null
  }

  const mainRow = getRowByPlayerName(decodedPlayer)

  // compare rows (independent per chart)
  const rankCompareRows = useMemo(
    () => rankCompareNames.map(n => getRowByPlayerName(n)),
    [rankCompareNames, data]
  )
  const fptsCompareRows = useMemo(
    () => fptsCompareNames.map(n => getRowByPlayerName(n)),
    [fptsCompareNames, data]
  )
  const salaryCompareRows = useMemo(
    () => salaryCompareNames.map(n => getRowByPlayerName(n)),
    [salaryCompareNames, data]
  )

  const nextSeasonYear = currentYear + 1
  const wageNextSeason = useMemo(() => {
    if (!mainRow) return null
    return toSalaryOrNull(mainRow[String(nextSeasonYear)])
  }, [mainRow, nextSeasonYear])

  // ----- Trend builders -----
  const getRankTrend = row => {
    const t = []
    if (!row) return t

    for (let y = startYear; y <= currentYear; y++) {
      const rankKey = y === currentYear ? "Rank" : `${y} Rank`
      const gamesKey = `${y} G`

      const rankRaw = toNumberOrNull(row[rankKey])
      const games = toIntOrNull(row[gamesKey])

      const isDNP = games === 0
      const value = isDNP ? BOTTOM_RANK : rankRaw

      t.push({ year: y, value, isDNP, games })
    }
    return t
  }

  const getFptsTrend = row => {
    const t = []
    if (!row) return t
    for (let y = startYear; y <= currentYear; y++) {
      const key = y === currentYear ? "Fpts/G" : `${y} Fpts/g`
      t.push({ year: y, value: toNumberOrNull(row[key]) })
    }
    return t
  }

  const getSalaryTrend = row => {
    const t = []
    if (!row) return t
    for (let y = startYear; y <= currentYear; y++) {
      const key = String(y)
      t.push({ year: y, value: toSalaryOrNull(row[key]) })
    }
    return t
  }

  const mergeChartData = (mainTrend, compareTrends) => {
    const map = new Map()
    for (let y = startYear; y <= currentYear; y++) {
      map.set(y, {
        year: y,
        main: null,
        c0: null,
        c1: null,
        c2: null,
        c3: null,
        c4: null
      })
    }

    mainTrend.forEach(p => {
      if (map.has(p.year)) map.get(p.year).main = p.value
    })

    compareTrends.forEach((trend, i) => {
      const key = `c${i}`
      trend.forEach(p => {
        if (map.has(p.year)) map.get(p.year)[key] = p.value
      })
    })

    return Array.from(map.values())
  }

  const mainRankTrend = useMemo(() => getRankTrend(mainRow), [mainRow])
  const mainFptsTrend = useMemo(() => getFptsTrend(mainRow), [mainRow])
  const mainSalaryTrend = useMemo(() => getSalaryTrend(mainRow), [mainRow])

  const careerArc = useMemo(() => {
    const rankPoints = (mainRankTrend || [])
      .filter(p => Number.isFinite(p.value))
      .map(p => ({ year: p.year, rank: p.value }))

    const fptsPoints = (mainFptsTrend || [])
      .filter(p => Number.isFinite(p.value))
      .map(p => ({ year: p.year, fpts: p.value }))

    const salaryPoints = (mainSalaryTrend || [])
      .filter(p => Number.isFinite(p.value))
      .map(p => ({ year: p.year, salary: p.value }))

    let bestRank = null
    let worstRank = null
    for (const p of rankPoints) {
      if (!bestRank || p.rank < bestRank.rank) bestRank = p
      if (!worstRank || p.rank > worstRank.rank) worstRank = p
    }

    let bestFpts = null
    for (const p of fptsPoints) {
      if (!bestFpts || p.fpts > bestFpts.fpts) bestFpts = p
    }

    let biggestJump = null
    let biggestDrop = null
    for (let i = 1; i < rankPoints.length; i++) {
      const prev = rankPoints[i - 1]
      const curr = rankPoints[i]
      const diff = curr.rank - prev.rank // + = worse, - = better

      if (diff < 0) {
        const jump = -diff
        if (!biggestJump || jump > biggestJump.delta) {
          biggestJump = { fromYear: prev.year, toYear: curr.year, delta: jump }
        }
      } else if (diff > 0) {
        const drop = diff
        if (!biggestDrop || drop > biggestDrop.delta) {
          biggestDrop = { fromYear: prev.year, toYear: curr.year, delta: drop }
        }
      }
    }

    let salaryPeak = null
    for (const p of salaryPoints) {
      if (!salaryPeak || p.salary > salaryPeak.salary) salaryPeak = p
    }

    return { bestRank, bestFpts, worstRank, biggestJump, biggestDrop, salaryPeak }
  }, [mainRankTrend, mainFptsTrend, mainSalaryTrend])

  const rankCompareTrends = useMemo(
    () => rankCompareRows.map(r => getRankTrend(r)),
    [rankCompareRows]
  )
  const fptsCompareTrends = useMemo(
    () => fptsCompareRows.map(r => getFptsTrend(r)),
    [fptsCompareRows]
  )
  const salaryCompareTrends = useMemo(
    () => salaryCompareRows.map(r => getSalaryTrend(r)),
    [salaryCompareRows]
  )

  const rankChartData = useMemo(
    () => mergeChartData(mainRankTrend, rankCompareTrends),
    [mainRankTrend, rankCompareTrends]
  )

  const rankChartDataWithDelta = useMemo(() => {
    let prev = null
    return rankChartData.map(d => {
      const curr = Number.isFinite(d.main) ? d.main : null

      let dir = null
      let text = null

      if (curr != null && prev != null) {
        if (curr < prev) {
          dir = "up"
          text = `↑${prev - curr}`
        } else if (curr > prev) {
          dir = "down"
          text = `↓${curr - prev}`
        } else {
          dir = "same"
          text = "–"
        }
      }

      if (curr != null) prev = curr

      return { ...d, mainDeltaDir: dir, mainDeltaText: text }
    })
  }, [rankChartData])

  const fptsChartData = useMemo(
    () => mergeChartData(mainFptsTrend, fptsCompareTrends),
    [mainFptsTrend, fptsCompareTrends]
  )
  const salaryChartData = useMemo(
    () => mergeChartData(mainSalaryTrend, salaryCompareTrends),
    [mainSalaryTrend, salaryCompareTrends]
  )

  const rankVals = rankChartData
    .flatMap(d => [d.main, d.c0, d.c1, d.c2, d.c3, d.c4])
    .filter(v => Number.isFinite(v))
  const maxRank = rankVals.length ? Math.max(...rankVals) : 200

  const fptsVals = fptsChartData
    .flatMap(d => [d.main, d.c0, d.c1, d.c2, d.c3, d.c4])
    .filter(v => Number.isFinite(v))
  const maxFpts = fptsVals.length ? Math.max(...fptsVals) : 0
  const minFpts = fptsVals.length ? Math.min(...fptsVals) : 0

  const salaryVals = salaryChartData
    .flatMap(d => [d.main, d.c0, d.c1, d.c2, d.c3, d.c4])
    .filter(v => Number.isFinite(v))
  const maxSalary = salaryVals.length ? Math.max(...salaryVals) : 0
  const minSalary = salaryVals.length ? Math.min(...salaryVals) : 0

  const allPlayerNames = useMemo(() => {
    const names = data.map(r => String(r["Player"] ?? "").trim()).filter(Boolean)
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
  }, [data])

  const isDuplicateInList = (list, idx, value) => {
    const v = normName(value)
    if (!v) return false
    if (mainRow && normName(mainRow["Player"]) === v) return true
    return list.some((n, i) => i !== idx && normName(n) === v)
  }

  const renderCompareInputs = (title, names, setNames, compareRows) => (
    <div className="mt-4 border-t border-slate-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-orange-400">{title}</div>
        <button
          className="text-xs text-slate-300 hover:text-white underline"
          onClick={() => setNames(Array(MAX_COMPARE).fill(""))}
          type="button"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {names.map((val, idx) => {
          const dup = isDuplicateInList(names, idx, val)
          const row = compareRows[idx]
          const hasText = String(val ?? "").trim().length > 0
          const noMatch = hasText && !row

          return (
            <div key={idx}>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[idx + 1] || "#e2e8f0" }}
                  title="Line color"
                />
                <input
                  className={`w-full bg-slate-900 border rounded px-3 py-2 text-sm outline-none
                    ${dup || noMatch ? "border-red-500" : "border-slate-700"}
                    focus:border-orange-400`}
                  list="players-list"
                  value={val}
                  onChange={e => {
                    const next = [...names]
                    next[idx] = e.target.value
                    setNames(next)
                  }}
                  placeholder="Type a player…"
                />
              </div>

              {dup && (
                <div className="text-xs text-red-400 mt-1">
                  Duplicate (already selected).
                </div>
              )}
              {noMatch && !dup && (
                <div className="text-xs text-red-400 mt-1">No exact match.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // main rank dot with YoY badge (always left)
  const RankMainDot = props => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null) return null

    const dir = payload?.mainDeltaDir
    const text = payload?.mainDeltaText

    let textClass = "text-slate-300"
    let borderClass = "border-slate-600/60"
    if (dir === "up") {
      textClass = "text-green-300"
      borderClass = "border-green-500/50"
    } else if (dir === "down") {
      textClass = "text-red-300"
      borderClass = "border-red-500/50"
    }

    const badgeW = 52
    const x = cx - (badgeW + 8)
    const y = cy - 14

    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill={LINE_COLORS[0]} />
        {text && (
          <foreignObject x={x} y={y} width={badgeW} height={22}>
            <div
              className={`px-1.5 py-0.5 text-[11px] leading-none rounded-md
                bg-slate-900/80 border ${borderClass} ${textClass}
                whitespace-nowrap text-right`}
            >
              {text}
            </div>
          </foreignObject>
        )}
      </g>
    )
  }

  const renderLines = compareRows => (
    <>
      <Line
        type="monotone"
        dataKey="main"
        name={mainRow["Player"]}
        stroke={LINE_COLORS[0]}
        strokeWidth={3}
        dot={{ r: 4 }}
        activeDot={{ r: 6 }}
        connectNulls
      />

      {compareRows.map((row, i) => {
        if (!row) return null
        const key = `c${i}`
        const color = LINE_COLORS[i + 1] || "#e2e8f0"
        const dashed = i % 2 === 0 ? "6 4" : "2 4"

        return (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={row["Player"]}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
            strokeDasharray={dashed}
          />
        )
      })}
    </>
  )

  // ✅ grouped transactions: 1 card per transaction block (Date starts block)
  const playerTransactions = useMemo(() => {
    const target = normFuzzy(decodedPlayer)

    const groups = new Map()
    for (const r of txRows) {
      if (r.txId == null || r.txId < 0) continue
      if (!groups.has(r.txId)) groups.set(r.txId, [])
      groups.get(r.txId).push(r)
    }

    const out = []

    for (const [id, lines] of groups.entries()) {
      // include if player appears on ANY line of the transaction
      const involves = lines.some(l => {
        const a = normFuzzy(l.assetA)
        const b = normFuzzy(l.assetB)
        return a === target || b === target
      })
      if (!involves) continue

      lines.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
      const head = lines[0]

      const sent = []
      const received = []
      for (const l of lines) {
        if (l.assetA) sent.push(`${l.assetA}${l.salaryA ? ` (${l.salaryA})` : ""}`)
        if (l.assetB) received.push(`${l.assetB}${l.salaryB ? ` (${l.salaryB})` : ""}`)
      }

      out.push({
        txId: id,
        date: head.date,
        type: head.type,
        teamA: head.teamA,
        teamB: head.teamB,
        rookie: head.rookie,
        sent,
        received,
        lines
      })
    }

    const toSortable = d => {
      const m = String(d || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (!m) return 0
      return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1])
    }
    out.sort((a, b) => toSortable(b.date) - toSortable(a.date))

    return out
  }, [txRows, decodedPlayer])

  if (loading) return <div className="p-6 text-white">Loading...</div>
  if (error) return <div className="p-6 text-red-500">{error}</div>

  if (!mainRow) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 text-white">
        <div className="mb-4">
          <Link className="text-orange-400 hover:underline" to="/players">
            ← Back to Players
          </Link>
        </div>
        <div className="bg-slate-800 rounded p-4">
          Player not found:{" "}
          <span className="text-orange-400">{decodedPlayer}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-white">
      <div className="mb-4">
        <Link className="text-orange-400 hover:underline" to="/players">
          ← Back to Players
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-orange-400 mb-1">
        {mainRow["Player"]}
      </h1>

      <div className="text-sm text-slate-400 mb-6">
        {mainRow["Position"] ? `Position: ${mainRow["Position"]}` : null}
        {mainRow["Current Owner"] ? ` • Owner: ${mainRow["Current Owner"]}` : null}
      </div>

      {/* ===== Career Arc Summary ===== */}
      <div className="bg-slate-800 p-4 rounded mb-6">
        <h2 className="text-lg font-semibold text-orange-400 mb-3">
          Career Arc Summary
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-sm">
          <div className="bg-slate-900/60 border border-slate-700 rounded p-3">
            <div className="text-slate-400 text-xs mb-1">Best year (Rank)</div>
            <div className="font-semibold">
              {careerArc.bestRank
                ? `${careerArc.bestRank.year} — #${careerArc.bestRank.rank}`
                : "-"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700 rounded p-3">
            <div className="text-slate-400 text-xs mb-1">Best year (Fpts/G)</div>
            <div className="font-semibold text-sky-200">
              {careerArc.bestFpts
                ? `${careerArc.bestFpts.year} — ${careerArc.bestFpts.fpts}`
                : "-"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700 rounded p-3">
            <div className="text-slate-400 text-xs mb-1">Worst year (Rank)</div>
            <div className="font-semibold">
              {careerArc.worstRank
                ? `${careerArc.worstRank.year} — #${careerArc.worstRank.rank}`
                : "-"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700 rounded p-3">
            <div className="text-slate-400 text-xs mb-1">Biggest jump</div>
            <div className="font-semibold text-green-300">
              {careerArc.biggestJump
                ? `${careerArc.biggestJump.fromYear}→${careerArc.biggestJump.toYear} (↑${careerArc.biggestJump.delta})`
                : "-"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700 rounded p-3">
            <div className="text-slate-400 text-xs mb-1">Biggest drop</div>
            <div className="font-semibold text-red-300">
              {careerArc.biggestDrop
                ? `${careerArc.biggestDrop.fromYear}→${careerArc.biggestDrop.toYear} (↓${careerArc.biggestDrop.delta})`
                : "-"}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-700 rounded p-3">
            <div className="text-slate-400 text-xs mb-1">Salary peak</div>
            <div className="font-semibold text-orange-300">
              {careerArc.salaryPeak
                ? `${careerArc.salaryPeak.year} — $${careerArc.salaryPeak.salary}m`
                : "-"}
            </div>
          </div>
        </div>
      </div>

      {/* 2 charts side-by-side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== LEFT: Rank ===== */}
        <div className="bg-slate-800 p-4 rounded">
          <h2 className="text-lg font-semibold text-orange-400 mb-3">
            Rank Trend ({startYear} → {currentYear})
          </h2>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rankChartDataWithDelta}
                margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis domain={[1, maxRank]} reversed allowDecimals={false} />
                <Tooltip
                  labelFormatter={label => `Year: ${label}`}
                  formatter={(value, name) => [value == null ? "-" : value, name]}
                />

                <Line
                  type="monotone"
                  dataKey="main"
                  name={mainRow["Player"]}
                  stroke={LINE_COLORS[0]}
                  strokeWidth={3}
                  dot={<RankMainDot />}
                  activeDot={{ r: 6 }}
                  connectNulls
                />

                {rankCompareRows.map((row, i) => {
                  if (!row) return null
                  const key = `c${i}`
                  const color = LINE_COLORS[i + 1] || "#e2e8f0"
                  const dashed = i % 2 === 0 ? "6 4" : "2 4"

                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={row["Player"]}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                      strokeDasharray={dashed}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {renderCompareInputs(
            "Compare with other players (up to 5)",
            rankCompareNames,
            setRankCompareNames,
            rankCompareRows
          )}
        </div>

        {/* ===== RIGHT: Fpts/G ===== */}
        <div className="bg-slate-800 p-4 rounded">
          <h2 className="text-lg font-semibold text-orange-400 mb-3">
            Fpts/G Trend ({startYear} → {currentYear})
          </h2>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={fptsChartData}
                margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis
                  domain={[
                    minFpts ? Math.floor(minFpts * 0.95) : 0,
                    maxFpts ? Math.ceil(maxFpts * 1.05) : 10
                  ]}
                  allowDecimals={true}
                />
                <Tooltip
                  labelFormatter={label => `Year: ${label}`}
                  formatter={(value, name) => [value == null ? "-" : value, name]}
                />
                {renderLines(fptsCompareRows)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {renderCompareInputs(
            "Compare with other players (up to 5)",
            fptsCompareNames,
            setFptsCompareNames,
            fptsCompareRows
          )}
        </div>
      </div>

      {/* ===== THIRD: Salary (full width below) ===== */}
      <div className="mt-6 bg-slate-800 p-4 rounded">
        <h2 className="text-lg font-semibold text-orange-400 mb-3 flex items-center justify-between gap-4">
          <span>Salary Trend ({startYear} → {currentYear})</span>

          <span className="text-sm font-semibold text-slate-200">
            Wage (next season):{" "}
            <span className="text-orange-300">
              {wageNextSeason == null ? "-" : `$${wageNextSeason}m`}
            </span>
            <span className="ml-2 text-xs text-slate-400">({nextSeasonYear})</span>
          </span>
        </h2>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={salaryChartData}
              margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                domain={[
                  minSalary ? Math.floor(minSalary * 0.95) : 0,
                  maxSalary ? Math.ceil(maxSalary * 1.05) : 10
                ]}
                allowDecimals={false}
              />
              <Tooltip
                labelFormatter={label => `Year: ${label}`}
                formatter={(value, name) => [value == null ? "-" : `${value}m`, name]}
              />
              {renderLines(salaryCompareRows)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== Transactions (1 card per transaction, expandable) ===== */}
      <div className="mt-6 bg-slate-800 p-4 rounded">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-orange-400">
            Transactions involving {mainRow["Player"]}
          </h2>
          <div className="text-sm text-slate-300">
            {txLoading ? "Loading..." : `${playerTransactions.length} found`}
          </div>
        </div>

        {txError ? (
          <div className="mt-3 text-red-300">{txError}</div>
        ) : txLoading ? (
          <div className="mt-3 text-slate-300">Loading transactions…</div>
        ) : playerTransactions.length === 0 ? (
          <div className="mt-3 text-slate-300">No transactions found.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {playerTransactions.map(tx => (
              <details
                key={tx.txId}
                className="bg-slate-900/60 border border-slate-700 rounded-xl p-4"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="font-semibold text-slate-100">
                      {tx.date} •{" "}
                      <span className="text-orange-300">{tx.type}</span>
                    </div>
                    <div className="text-sm text-slate-300">
                      {tx.teamA || "-"}{" "}
                      {tx.type?.toLowerCase() === "trade" ? "↔" : "→"}{" "}
                      {tx.type?.toLowerCase() === "trade" ? tx.teamB || "-" : ""}
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-slate-200">
                    <span className="text-slate-400">Sent:</span>{" "}
                    {tx.sent.length ? tx.sent.join(", ") : "-"}
                  </div>

                  {tx.type?.toLowerCase() === "trade" ? (
                    <div className="mt-1 text-sm text-slate-200">
                      <span className="text-slate-400">Received:</span>{" "}
                      {tx.received.length ? tx.received.join(", ") : "-"}
                    </div>
                  ) : null}

                  <div className="mt-2 text-xs text-slate-400">
                    Click to expand details
                  </div>
                </summary>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-slate-300">
                        <th className="text-left py-2 pr-4">Team A</th>
                        <th className="text-left py-2 pr-4">Asset</th>
                        <th className="text-left py-2 pr-4">Salary</th>
                        <th className="text-left py-2 pr-4">Team B</th>
                        <th className="text-left py-2 pr-4">Asset</th>
                        <th className="text-left py-2 pr-4">Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tx.lines.map((l, i) => (
                        <tr key={i} className="border-t border-slate-700">
                          <td className="py-2 pr-4 text-slate-200">
                            {l.teamA || "-"}
                          </td>
                          <td className="py-2 pr-4 text-slate-200">
                            {l.assetA || "-"}
                          </td>
                          <td className="py-2 pr-4 text-slate-200">
                            {l.salaryA || "-"}
                          </td>
                          <td className="py-2 pr-4 text-slate-200">
                            {l.teamB || "-"}
                          </td>
                          <td className="py-2 pr-4 text-slate-200">
                            {l.assetB || "-"}
                          </td>
                          <td className="py-2 pr-4 text-slate-200">
                            {l.salaryB || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* ✅ datalist needed for autocomplete suggestions */}
      <datalist id="players-list">
        {allPlayerNames.map(n => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  )
}