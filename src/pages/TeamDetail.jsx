// src/pages/TeamDetail.jsx
import { useLeague } from "../context/LeagueContext"
import { useParams, Link } from "react-router-dom"
import { useState, useEffect, useMemo } from "react"
import { fetchTeamSheet } from "../utils/fetchTeamSheet"
import { TEAM_SHEETS } from "../config/teamSheets"
import { fetchHistoryTable } from "../utils/fetchHistory"
import { fetchTransactionsRows } from "../utils/fetchTransactions"
import { fetchPlayerOptions, getOptionForPlayerYear, optionLabel } from "../utils/fetchPlayerOptions"
import { fetchOverviewMapping } from "../utils/fetchOverview"

/* ----------------------------- helpers (History summary) ----------------------------- */

function s(x) {
  return String(x ?? "").replace(/\r/g, "").trim()
}

function isExcludedType(v) {
  const t = s(v).toUpperCase()
  return t === "M" || t === "IRE"
}

function getOverviewEntry(map, teamName) {
  const want = normTeam(teamName)
  for (const [k, v] of Object.entries(map || {})) {
    if (normTeam(k) === want) return { key: k, ...(v || {}) }
  }
  return null
}

function norm(x) {
  return String(x ?? "")
    .replace(/\r/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[％]/g, "%")
    .replace(/[’'“”"]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[\/∕]/g, "/")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function normTeam(x) {
  return s(x)
    .replace(/\u00A0/g, " ")
    .replace(/[’'“”"]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function slugifyTeam(x) {
  return String(x ?? "")
    .replace(/\r/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[’'“”"]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/[\/∕]/g, "/")
    .replace(/[().,!:;?_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
}

function buildUniqueKeys(headers) {
  const seen = new Map()
  return (headers || []).map(h => {
    const key = s(h)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return n === 1 ? key : `${key} (${n})`
  })
}

function getBaseCount(headersRow) {
  const headers = (headersRow || []).map(h => norm(h))
  const seqA = ["division", "conference", "team", "champs / finals"]
  const seqB = ["division", "conference", "team", "champs/finals"]

  const matchSeq = seq => {
    let idx = 0
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] === seq[idx]) idx++
      if (idx === seq.length) return i + 1
    }
    return null
  }

  return matchSeq(seqA) || matchSeq(seqB) || 4
}

function findColKey(cols, headerName) {
  const target = norm(headerName)
  const hit = (cols || []).find(c => norm(c.header) === target)
  return hit?.key || null
}

/** 119 -> 11,9% */
function formatTenthsPercent(raw) {
  const t = s(raw)
  if (!t) return ""
  const cleaned = t.replace(/,/g, ".")
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return t
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return t
  return `${(n / 10).toFixed(1).replace(".", ",")}%`
}

function parseHistoryToSummaryMap(grid) {
  const rows = Array.isArray(grid) ? grid : []
  if (rows.length < 2) return {}

  const headerRowRaw = rows[1] || []
  const colCount = headerRowRaw.length
  if (colCount < 8) return {}

  const headerRow = new Array(colCount).fill("").map((_, i) => s(headerRowRaw[i]))
  const baseCount = getBaseCount(headerRow)

  const uniqueHeaders = buildUniqueKeys(headerRow)
  const cols = uniqueHeaders.map((key, idx) => ({
    idx,
    key,
    header: headerRow[idx] || key
  }))

  const teamKey = findColKey(cols, "Team")
  const awardsKey =
    findColKey(cols, "Champs / Finals") ||
    findColKey(cols, "Champs/Finals") ||
    (baseCount >= 4 ? cols[baseCount - 1]?.key : null)

  const recordsIdxs = [colCount - 3, colCount - 2, colCount - 1].filter(i => i >= baseCount)
  const totalIdxs = [colCount - 6, colCount - 5, colCount - 4].filter(i => i >= baseCount)

  const recordsKeys = recordsIdxs.map(i => cols[i]?.key).filter(Boolean)
  const totalKeys = totalIdxs.map(i => cols[i]?.key).filter(Boolean)

  const byTeam = {}

  for (let r = 2; r < rows.length; r++) {
    const rowRaw = rows[r] || []
    const row = new Array(colCount).fill("").map((_, i) => s(rowRaw[i]))

    const rowHasAnything = row.some(v => v)
    const baseHasAnything = row.slice(0, baseCount).some(v => v)
    if (!rowHasAnything || !baseHasAnything) break

    const obj = {}
    for (const c of cols) obj[c.key] = row[c.idx] ?? ""

    const team = teamKey ? s(obj[teamKey]) : ""
    if (!team) continue

    const awards = awardsKey ? s(obj[awardsKey]) : ""

    const bestRecordRaw = recordsKeys[0] ? obj[recordsKeys[0]] : ""
    const bestFptsAdj = recordsKeys[1] ? s(obj[recordsKeys[1]]) : ""
    const bestPlayoffs = recordsKeys[2] ? s(obj[recordsKeys[2]]) : ""

    const totalRecordRaw = totalKeys[0] ? obj[totalKeys[0]] : ""
    const totalFptsAdj = recordsKeys[1] ? s(obj[recordsKeys[1]]) : ""
    const totalPlayoffsApps = totalKeys[2] ? s(obj[totalKeys[2]]) : ""

    byTeam[norm(team)] = {
      team,
      awards: awards || "",

      bestRecordW: formatTenthsPercent(bestRecordRaw),
      bestFptsAdjusted: bestFptsAdj,
      bestPlayoffs: bestPlayoffs,

      totalRecordW: formatTenthsPercent(totalRecordRaw),
      totalFptsAdjusted: totalFptsAdj,
      totalPlayoffsAppearances: totalPlayoffsApps
    }
  }

  return byTeam
}

function pickBestTeamMatch(map, decodedTeam) {
  if (!map) return null
  const key = norm(decodedTeam)
  if (map[key]) return map[key]

  const entries = Object.entries(map)
  const starts = entries.find(([k]) => k.startsWith(key) || key.startsWith(k))
  if (starts) return starts[1]

  const contains = entries.find(([k]) => k.includes(key) || key.includes(k))
  if (contains) return contains[1]

  return null
}

/* ----------------------------- helpers (Transactions) ----------------------------- */

function canonTxType(t) {
  return s(t)
    .toLowerCase()
    .replace(/[\u00A0\s]/g, "")
    .replace(/[-_–—]/g, "")
}

function isTrade(type) {
  return canonTxType(type) === "trade"
}

function dateSortable(d) {
  const m = String(d || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return 0
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1])
}

/* ----------------------------- helpers (Contracts by position) ----------------------------- */

function normPos(p) {
  const x = s(p).toUpperCase()
  if (!x) return null
  if (x.startsWith("G")) return "G"
  if (x.startsWith("F")) return "F"
  if (x.startsWith("C")) return "C"
  return null
}

/* ----------------------------- Player Options Badges ----------------------------- */

function OptionBadge({ tp }) {
  if (!tp) return null
  const isT = tp === "T"
  const text = isT ? "TO" : "PO"

  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border align-middle",
        isT
          ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30"
          : "bg-sky-500/10 text-sky-200 border-sky-500/30"
      ].join(" ")}
      title={optionLabel(tp)}
    >
      {text}
    </span>
  )
}

function TypeBadgeSmall({ t }) {
  const v = s(t).toUpperCase()
  if (!v || v === "-") return <span className="text-slate-500">-</span>

  const map = {
    R: { label: "R", title: "Rookie", cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" },
    M: { label: "M", title: "Minor", cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30" },
    C: { label: "C", title: "Captain", cls: "bg-violet-600 text-white border-emerald-500/30" },
    IRE: { label: "IRE", title: "Injured Reserve Exception", cls: "bg-red-500/15 text-white border-red-500/40" }
  }

  const conf = map[v]
  if (!conf) return <span className="text-slate-300 text-xs">{v}</span>

  return (
    <span
      className={[
        "inline-flex items-center justify-center w-7 h-5 rounded-full text-[10px] font-bold border",
        conf.cls
      ].join(" ")}
      title={conf.title}
    >
      {conf.label}
    </span>
  )
}

/* ----------------------------- component ----------------------------- */

export default function TeamDetail() {
  const { table, loading, error } = useLeague()
  const { teamName } = useParams()

  // ✅ states (hooks must be before any conditional return)
  const [optionsByPlayerYear, setOptionsByPlayerYear] = useState({})
  const [activeTab, setActiveTab] = useState("salary") // "salary" | "data"
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" })
  const [dataSortConfig, setDataSortConfig] = useState({ key: "Rank", direction: "asc" })

  const [gmName, setGmName] = useState("")
  const [waiverByYear, setWaiverByYear] = useState({})
  const [picksByYear, setPicksByYear] = useState({})
  const [historySummary, setHistorySummary] = useState(null)

  const [txRows, setTxRows] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [txError, setTxError] = useState(null)

  const TX_TYPES = ["Trade", "Waiver", "Buy-out"]
  const [txFilter, setTxFilter] = useState("Trade")

  // ✅ safe destructuring
  const { data = [], headers = [], displayMap = {} } = table || {}
  const decodedTeam = decodeURIComponent(teamName)

  // ✅ derived constants (no hooks)
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3]
  const CAP = 200

  // ✅ memos BEFORE early returns
  const teamKey = useMemo(() => normTeam(decodedTeam), [decodedTeam])

  const teamPlayers = useMemo(() => {
    return (data || []).filter(row => row?.["Current Owner"] === decodedTeam)
  }, [data, decodedTeam])

  const teamSlug = useMemo(() => slugifyTeam(decodedTeam), [decodedTeam])
  const logoSrc = `/logos/${teamSlug}-logo.webp`
  const jerseyFrontSrc = `/logos/${teamSlug}-front.webp`
  const jerseyBackSrc = `/logos/${teamSlug}-back.webp`

  const posLabel = useMemo(() => ({ G: "Guards", F: "Forwards", C: "Centers" }), [])
  const posMax = useMemo(() => ({ G: 8, F: 8, C: 4 }), [])
  const posMin = useMemo(() => ({ G: 5, F: 5, C: 2 }), [])
  const ROSTER_TOTAL_LIMIT = 15
  const POS_ORDER = ["G", "F", "C"]

  const contractsByPos = useMemo(() => {
    const out = { G: { roster: 0, minors: 0 }, F: { roster: 0, minors: 0 }, C: { roster: 0, minors: 0 } }
    for (const p of teamPlayers) {
      const pos = normPos(p?.["Position"])
      if (!pos) continue
      const t = p?.["Rookie / Minor / Captain"]
      const excluded = isExcludedType(t)
      if (excluded) out[pos].minors += 1
      else out[pos].roster += 1
    }
    return out
  }, [teamPlayers])

  const rosterTotal = useMemo(() => {
    return (contractsByPos.G?.roster || 0) + (contractsByPos.F?.roster || 0) + (contractsByPos.C?.roster || 0)
  }, [contractsByPos])

  const salarySummary = useMemo(() => {
    const out = {}
    for (const year of years) {
      let roster = 0
      let minors = 0

      for (const player of teamPlayers) {
        const raw = player?.[String(year)] || ""
        if (!raw) continue

        const cleaned = String(raw).replace("$", "").replace("m", "").trim()
        const salary = parseFloat(cleaned)
        if (isNaN(salary)) continue

        const excluded = isExcludedType(player?.["Rookie / Minor / Captain"])
        if (excluded) minors += salary
        else roster += salary
      }

      const waiver = waiverByYear[year] || 0

      out[year] = {
        roster: roster + waiver,
        minors,
        waiver,
        capSpace: CAP - (roster + waiver)
      }
    }
    return out
  }, [teamPlayers, waiverByYear, years])

  const groupedPlayers = useMemo(() => {
    const out = {}
    for (const p of teamPlayers) {
      const pos = p?.["Position"] || "Unknown"
      if (!out[pos]) out[pos] = []
      out[pos].push(p)
    }
    return out
  }, [teamPlayers])

  const groupedDataPlayers = useMemo(() => {
    const out = {}
    for (const p of teamPlayers) {
      const pos = normPos(p?.["Position"]) || "Unknown"
      if (!out[pos]) out[pos] = []
      out[pos].push(p)
    }
    return out
  }, [teamPlayers])

  const WANT_DATA_COLS = ["Fpts", "Fpts/G", "Fpts/$", "Fpts/G/$", "Rank", "G", "Fpts/G for rank"]

  const dataTabHeaders = useMemo(() => {
    const set = new Set(headers || [])
    const out = []
    if (set.has("Player")) out.push("Player")
    for (const h of WANT_DATA_COLS) if (set.has(h)) out.push(h)
    return out
  }, [headers])

  const hasAnyDataTabCols = dataTabHeaders.length > 0

  // transactions derived
  const teamTransactionsAll = useMemo(() => {
    const groups = new Map()
    for (const r of txRows) {
      if (r?.txId == null || r.txId < 0) continue
      if (!groups.has(r.txId)) groups.set(r.txId, [])
      groups.get(r.txId).push(r)
    }

    const out = []
    for (const [id, lines] of groups.entries()) {
      lines.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
      const head = lines[0] || {}

      const aKey = normTeam(head.teamA)
      const bKey = normTeam(head.teamB)
      const trade = isTrade(head.type)

      const involves = aKey === teamKey || (trade && bKey === teamKey)
      if (!involves) continue

      const viewingAsB = trade && bKey === teamKey

      const sent = []
      const received = []

      for (const l of lines) {
        const a = l.assetA ? `${l.assetA}${l.salaryA ? ` (${l.salaryA})` : ""}` : ""
        const b = l.assetB ? `${l.assetB}${l.salaryB ? ` (${l.salaryB})` : ""}` : ""

        if (!viewingAsB) {
          if (a) sent.push(a)
          if (b) received.push(b)
        } else {
          if (b) sent.push(b)
          if (a) received.push(a)
        }
      }

      out.push({
        txId: id,
        date: head.date,
        type: head.type,
        teamA: head.teamA,
        teamB: head.teamB,
        sent,
        received,
        lines
      })
    }

    out.sort((x, y) => dateSortable(y.date) - dateSortable(x.date))
    return out
  }, [txRows, teamKey])

  const teamTransactions = useMemo(() => {
    const f = canonTxType(txFilter)
    return teamTransactionsAll.filter(t => canonTxType(t.type) === f)
  }, [teamTransactionsAll, txFilter])

  const txCounts = useMemo(() => {
    const c = { trade: 0, waiver: 0, buyout: 0 }
    for (const t of teamTransactionsAll) {
      const k = canonTxType(t.type)
      if (k === "trade") c.trade++
      else if (k === "waiver") c.waiver++
      else if (k === "buyout") c.buyout++
    }
    return c
  }, [teamTransactionsAll])

  /* ----------------------------- effects ----------------------------- */

  useEffect(() => {
    const ac = new AbortController()
    fetchPlayerOptions(ac.signal)
      .then(res => setOptionsByPlayerYear(res.byPlayerYear || {}))
      .catch(() => setOptionsByPlayerYear({}))
    return () => ac.abort()
  }, [])


  useEffect(() => {
  let alive = true

  const getOverviewEntry = (map, teamName) => {
    const want = normTeam(teamName)
    for (const [k, v] of Object.entries(map || {})) {
      if (normTeam(k) === want) return { key: k, ...(v || {}) }
    }
    return null
  }

  ;(async () => {
    try {
      const map = await fetchOverviewMapping()
      if (!alive) return

      const entry = getOverviewEntry(map, decodedTeam)
      const gm = entry?.gmName || ""

      setGmName(gm)
      // later if you need it:
      // setDraftCode(entry?.draftCode || "")
    } catch (e) {
      if (!alive) return
      setGmName("")
    }
  })()

  return () => {
    alive = false
  }
}, [decodedTeam])


  useEffect(() => {
    async function loadTeamSheet() {
      const teamConfig = TEAM_SHEETS[decodedTeam]
      if (!teamConfig) return

      try {
        const rows = await fetchTeamSheet(teamConfig.gid)
        


        // WAIVERS
        const extractedWaivers = {}
        const waiverRow = rows.find(r => r.some(cell => typeof cell === "string" && cell.trim().toLowerCase() === "waiver"))

        if (waiverRow) {
          const waiverIndex = waiverRow.findIndex(cell => typeof cell === "string" && cell.trim().toLowerCase() === "waiver")

          let yearOffset = 0
          for (let i = waiverIndex + 1; i < waiverRow.length; i++) {
            const raw = waiverRow[i]
            if (raw && String(raw).trim() !== "") {
              const cleaned = String(raw).replace("$", "").replace("m", "").trim()
              const value = parseFloat(cleaned)
              if (!isNaN(value) && yearOffset < years.length) {
                extractedWaivers[years[yearOffset]] = value
                yearOffset++
              }
            }
            if (yearOffset >= years.length) break
          }
        }
        setWaiverByYear(extractedWaivers)

        // PICKS
        const cleanCell = v => String(v ?? "").replace("\r", "").trim()
        const isMarked = v => {
          const t = cleanCell(v).toLowerCase()
          return t === "x" || t === "✓" || t === "1" || t === "yes" || t === "y" || t === "true"
        }
        const parseYear = cell => {
          const t = cleanCell(cell)
          const m = t.match(/\b(20\d{2})\b/)
          return m ? Number(m[1]) : null
        }

        const picksRowIndex = rows.findIndex(r => r.some(cell => typeof cell === "string" && cell.trim().toLowerCase() === "picks"))
        let picksColIndex = -1
        if (picksRowIndex !== -1) {
          picksColIndex = (rows[picksRowIndex] || []).findIndex(cell => typeof cell === "string" && cell.trim().toLowerCase() === "picks")
        }

        const pickNameCol = picksColIndex >= 0 ? picksColIndex : 1
        let yearColumnMap = {}

        const candidateHeaderRows = [picksRowIndex - 2, picksRowIndex - 1, picksRowIndex, picksRowIndex + 1, picksRowIndex + 2, picksRowIndex + 3]
          .filter(i => i >= 0 && i < rows.length)

        for (const idx of candidateHeaderRows) {
          const row = rows[idx] || []
          row.forEach((cell, colIndex) => {
            const y = parseYear(cell)
            if (y && years.includes(y)) yearColumnMap[colIndex] = y
          })
          if (Object.keys(yearColumnMap).length > 0) break
        }

        const inferYearColumnsFromMarks = () => {
          const counts = {}
          const start = picksRowIndex + 1
          const end = Math.min(rows.length, start + 50)

          for (let r = start; r < end; r++) {
            const row = rows[r] || []
            row.forEach((cell, colIndex) => {
              if (isMarked(cell)) counts[colIndex] = (counts[colIndex] || 0) + 1
            })
          }

          const topCols = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, years.length)
            .map(([col]) => Number(col))
            .sort((a, b) => a - b)

          const map = {}
          topCols.forEach((col, i) => { map[col] = years[i] })
          return { map }
        }

        if (picksRowIndex !== -1 && Object.keys(yearColumnMap).length === 0) {
          yearColumnMap = inferYearColumnsFromMarks().map
        }

        const grouped = {}
        years.forEach(y => { grouped[y] = { A: new Set(), B: new Set() } })

        const parsePickName = raw => {
          const t = cleanCell(raw)
          const m = t.match(/\s*-\s*([A-Za-z])\s*$/)
          const round = m ? m[1].toUpperCase() : null
          const team = m ? t.replace(/\s*-\s*[A-Za-z]\s*$/, "").trim() : t.trim()
          return { team, round }
        }

        if (picksRowIndex !== -1 && Object.keys(yearColumnMap).length > 0) {
          for (let r = picksRowIndex + 1; r < rows.length; r++) {
            const row = rows[r] || []
            const pickStr = cleanCell(row[pickNameCol])
            if (!pickStr) continue
            if (pickStr.toLowerCase() === "picks") continue

            const { team, round } = parsePickName(pickStr)

            Object.entries(yearColumnMap).forEach(([colIndexStr, year]) => {
              const colIndex = Number(colIndexStr)
              if (isMarked(row[colIndex])) {
                if (round === "A" || round === "B") grouped[year][round].add(team)
              }
            })
          }
        }

        const finalPicks = {}
        years.forEach(y => {
          finalPicks[y] = { A: Array.from(grouped[y].A), B: Array.from(grouped[y].B) }
        })

        setPicksByYear(finalPicks)
      } catch {
        // silent
      }
    }

    loadTeamSheet()

  }, [decodedTeam]) // eslint-disable-line react-hooks/exhaustive-deps
  

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetchHistoryTable()
        const grid = res?.grid
        const map = parseHistoryToSummaryMap(grid)
        const match = pickBestTeamMatch(map, decodedTeam)
        if (!alive) return
        setHistorySummary(match || null)
      } catch {
        if (!alive) return
        setHistorySummary(null)
      }
    })()
    return () => { alive = false }
  }, [decodedTeam])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setTxLoading(true)
        setTxError(null)
        const rows = await fetchTransactionsRows()
        if (!alive) return
        setTxRows(rows || [])
      } catch (e) {
        if (!alive) return
        setTxError(e?.message || String(e))
        setTxRows([])
      } finally {
        if (!alive) return
        setTxLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  /* ----------------------------- sorting helpers (no hooks) ----------------------------- */

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }))
  }

  const sortSalaryPlayers = players => {
    if (!sortConfig.key) return players

    return [...players].sort((a, b) => {
      let valA = a?.[sortConfig.key] ?? ""
      let valB = b?.[sortConfig.key] ?? ""

      const clean = v => {
        if (typeof v !== "string") return v
        const cleaned = v.replace("$", "").replace("m", "").trim()
        const num = parseFloat(cleaned)
        return isNaN(num) ? v.toLowerCase() : num
      }

      valA = clean(valA)
      valB = clean(valB)

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1
      return 0
    })
  }

  const handleDataSort = key => {
    setDataSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }))
  }

  const sortDataRows = rows => {
    if (!dataSortConfig.key) return rows
    const key = dataSortConfig.key

    const toNum = v => {
      if (v == null || v === "") return NaN
      const n = Number(String(v).replace(/[^\d.-]/g, ""))
      return Number.isFinite(n) ? n : NaN
    }

    return [...rows].sort((a, b) => {
      const aRaw = a?.[key]
      const bRaw = b?.[key]
      const aNum = toNum(aRaw)
      const bNum = toNum(bRaw)

      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return dataSortConfig.direction === "asc" ? aNum - bNum : bNum - aNum
      }

      const aStr = s(aRaw).toLowerCase()
      const bStr = s(bRaw).toLowerCase()
      if (aStr < bStr) return dataSortConfig.direction === "asc" ? -1 : 1
      if (aStr > bStr) return dataSortConfig.direction === "asc" ? 1 : -1
      return 0
    })
  }

  const renderPickLines = arr => {
    if (!arr || arr.length === 0) return "-"
    return <div className="whitespace-pre-line leading-5">{arr.join("\n")}</div>
  }

  const filterBtnClass = active =>
    `px-3 py-2 rounded-lg text-sm font-semibold border transition ${
      active
        ? "bg-orange-500/20 border-orange-400 text-orange-200"
        : "bg-slate-900/40 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
    }`

  const countFor = t => {
    const k = canonTxType(t)
    if (k === "trade") return txCounts.trade
    if (k === "waiver") return txCounts.waiver
    if (k === "buyout") return txCounts.buyout
    return 0
  }

  const tabBtn = isActive =>
    `px-3 py-2 rounded-lg text-sm font-semibold border transition ${
      isActive
        ? "bg-orange-500/20 border-orange-400 text-orange-200"
        : "bg-slate-900/40 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
    }`

  const onImgError = fallback => e => {
    e.currentTarget.onerror = null
    e.currentTarget.src = fallback
  }

  // ✅ early returns AFTER all hooks/memos/effects
  if (loading) return <div className="p-6 text-white">Loading...</div>
  if (error) return <div className="p-6 text-red-500">{error}</div>

  return (
    <div className="min-h-screen bg-slate-900 p-4 text-white">
      <div className="mb-4">
        <Link className="text-orange-400 hover:underline" to="/teams">
          ← Back to Teams
        </Link>
      </div>

      {/* ================= TOP 3 BOXES ================= */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Box 1: Team Logo + Name + GM */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="h-24 w-24 rounded-xl bg-slate-800/60 p-3 flex items-center justify-center">
              <img
                src={logoSrc}
                alt={`${decodedTeam} logo`}
                className="h-full w-full object-contain"
                onError={onImgError("/logos/_default-logo.webp")}
              />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-orange-400">{decodedTeam}</h1>
              <p className="text-sm text-slate-400 mt-1">
                GM: <span className="text-orange-400">{gmName || "—"}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Box 2: Jerseys (HIDDEN on mobile) */}
        <div className="hidden md:block rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-800/60 p-3 flex flex-col items-center">
              <img
                src={jerseyFrontSrc}
                alt={`${decodedTeam} jersey front`}
                className="h-48 w-full object-contain"
                onError={onImgError("/logos/_default-jersey.webp")}
              />
            </div>

            <div className="rounded-lg bg-slate-800/60 p-3 flex flex-col items-center">
              <img
                src={jerseyBackSrc}
                alt={`${decodedTeam} jersey back`}
                className="h-48 w-full object-contain"
                onError={onImgError("/logos/_default-jersey.webp")}
              />
            </div>
          </div>
        </div>

        {/* Box 3: History Records */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-orange-400">History Records</h2>
            <div className="text-xs text-slate-400">Best-ever</div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Best Record</div>
              <div className="mt-1 text-lg font-bold text-white">{historySummary?.bestRecordW || "—"}</div>
            </div>

            <div className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Best Fpts/G Adj</div>
              <div className="mt-1 text-lg font-bold text-white">{historySummary?.bestFptsAdjusted || "—"}</div>
            </div>

            <div className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Best Playoffs</div>
              <div className="mt-1 text-sm font-semibold text-white">{historySummary?.bestPlayoffs || "—"}</div>
            </div>

            <div className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Awards</div>
              <div className="mt-1 text-sm font-semibold text-white">{historySummary?.awards || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= SALARY + PICKS (SIDE-BY-SIDE on md+, STACK on mobile) ================= */}
      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Salary Summary card */}
        <div className="bg-slate-800 p-4 rounded">
          <h2 className="text-lg font-semibold text-orange-400 mb-4">Salary Summary</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-700 text-orange-400">
                  <th className="p-2 text-left">Year</th>
                  <th className="p-2 text-right">
                    Roster <br /> (incl Waivers)
                  </th>
                  <th className="p-2 text-right">Minors</th>
                  <th className="p-2 text-right">Waiver</th>
                  <th className="p-2 text-right">Cap Space</th>
                </tr>
              </thead>
              <tbody>
                {years.map(year => (
                  <tr key={year} className="border-b border-slate-700">
                    <td className="p-2 font-semibold">{year}</td>
                    <td className="p-2 text-right">${salarySummary[year]?.roster ?? 0}m</td>
                    <td className="p-2 text-right">${salarySummary[year]?.minors ?? 0}m</td>
                    <td className="p-2 text-right text-yellow-400">${salarySummary[year]?.waiver ?? 0}m</td>
                    <td
                      className={`p-2 text-right ${
                        (salarySummary[year]?.capSpace ?? 0) < 0 ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      ${salarySummary[year]?.capSpace ?? 0}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Draft Picks card */}
        <div className="bg-slate-800 p-4 rounded">
          <h2 className="text-lg font-semibold text-orange-400 mb-4">Draft Picks</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-700 text-orange-400">
                  <th className="p-2 text-left w-24">Year</th>
                  <th className="p-2 text-left">Round A Picks</th>
                  <th className="p-2 text-left">Round B Picks</th>
                </tr>
              </thead>
              <tbody>
                {years.map(year => (
                  <tr key={year} className="border-b border-slate-700 align-top">
                    <td className="p-2 font-semibold">{year}</td>
                    <td className="p-2">{renderPickLines(picksByYear[year]?.A)}</td>
                    <td className="p-2">{renderPickLines(picksByYear[year]?.B)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contracts by Position */}
        <div className="bg-slate-800 p-4 rounded md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-orange-400">
              Contracts (Total:{" "}
              <span className={`${rosterTotal > ROSTER_TOTAL_LIMIT ? "text-red-400" : "text-slate-200"}`}>
                {rosterTotal}
              </span>
              <span className="text-slate-500">/{ROSTER_TOTAL_LIMIT}</span>)
            </h2>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {POS_ORDER.map(k => {
              const min = posMin[k]
              const max = posMax[k]
              const roster = contractsByPos[k]?.roster || 0
              const minors = contractsByPos[k]?.minors || 0
              const bad = roster < min || roster > max
              const deficit = min - roster
              const surplus = roster - max

              let msg = ""
              if (deficit > 0) msg = `You need ${deficit} more for the minimum — please sign more players.`
              else if (surplus > 0) msg = `You are over the maximum — please waive/trade ${surplus} player${surplus === 1 ? "" : "s"}.`

              return (
                <div key={k} className="rounded-lg bg-slate-900/60 border border-slate-700 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">
                    {posLabel[k]} (Min {min} • Max {max})
                  </div>

                  <div className="mt-1 flex items-end gap-1">
                    <span className={`text-3xl font-bold leading-none ${bad ? "text-red-400" : "text-white"}`}>
                      {roster}
                    </span>
                  </div>

                  {msg ? (
                    <div className="mt-2 text-xs font-semibold text-red-300">{msg}</div>
                  ) : (
                    <div className="mt-2 text-xs text-green-300">Within limits</div>
                  )}

                  <div className="mt-1 text-xs text-slate-300">
                    Minors: <span className="text-slate-100 font-semibold">{minors}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ================= TAB SWITCH ================= */}
<div className="mb-4 flex flex-wrap gap-2">
  <button type="button" className={tabBtn(activeTab === "salary")} onClick={() => setActiveTab("salary")}>
    Salaries
  </button>
  <button type="button" className={tabBtn(activeTab === "data")} onClick={() => setActiveTab("data")}>
    Player Data
  </button>
</div>

{/* ================= PLAYER CONTENT ================= */}
{activeTab === "salary" ? (
  <>
    {/* Salary tables (match Player Data styling) */}
    {POS_ORDER.filter(pos => groupedPlayers[pos]).map(position => {
      const players = sortSalaryPlayers(groupedPlayers[position])
      const count = players.length

      return (
        <div key={position} className="mb-8">
          <h2 className="text-xl font-semibold mb-3">
            {posLabel[position]} <span className="text-slate-400 text-sm font-medium">({count} players)</span>
          </h2>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm table-auto">
              <thead>
                <tr className="bg-slate-700 text-orange-400">
                  <th
                    onClick={() => handleSort("Player")}
                    className="p-2 cursor-pointer text-left whitespace-nowrap min-w-[220px]"
                    title="Click to sort"
                  >
                    Player
                  </th>

                    <th
                      onClick={() => handleSort("Rookie / Minor / Captain")}
                      className="p-2 cursor-pointer text-center whitespace-nowrap w-[1%] min-w-[44px]"
                      title="Click to sort"
                    >
                      Type
                    </th>

                  {years.map(y => (
                  <th
                    key={y}
                    onClick={() => handleSort(String(y))}
                    className="p-2 text-right cursor-pointer whitespace-nowrap min-w-[96px]"
                    title="Click to sort"
                  >
                    {y}
                  </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {players.map((player, index) => (
                  <tr key={index} className="border-b border-slate-700 hover:bg-slate-800">
                    <td className="p-2 font-semibold text-slate-100 whitespace-nowrap">
                      {player["Player"]}
                    </td>

                    <td className="p-2 text-center whitespace-nowrap w-[1%]">
                      <TypeBadgeSmall t={player["Rookie / Minor / Captain"]} />
                    </td>

                    {years.map(y => {
                      const yearStr = String(y)
                      const salary = player?.[yearStr] || "-"
                      const playerName = player?.Player || player?.Name || player?.__col_0 || ""
                      const tp = getOptionForPlayerYear(optionsByPlayerYear, playerName, yearStr)

                      return (
                        <td key={y} className="p-2 whitespace-nowrap">
                          <div className="flex justify-end items-center gap-1">
                            {salary !== "-" && <OptionBadge tp={tp} />}
                            <span className="tabular-nums leading-none">{salary}</span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    })}

    {/* Badge disclaimer */}
    <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
      <div className="text-sm text-slate-200 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/10 text-emerald-200 border-emerald-500/30">
            TO
          </span>
          <span className="text-slate-300">= Team Option</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sky-500/10 text-sky-200 border-sky-500/30">
            PO
          </span>
          <span className="text-slate-300">= Player Option</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-violet-600 text-white">
            C
          </span>
          <span className="text-slate-300">= Captain</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/10 text-emerald-200 border-emerald-500/30">
            R
          </span>
          <span className="text-slate-300">= Rookie</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/10 text-emerald-200 border-emerald-500/30">
            M
          </span>
          <span className="text-slate-300">= Minor</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-red-500/15 text-white border-red-500/40">
            IRE
          </span>
          <span className="text-slate-300">= Injury Exception</span>
        </span>
      </div>
    </div>
  </>
) : (
  <>
    {/* Player Data tables grouped + sortable */}
    {POS_ORDER.filter(pos => groupedDataPlayers[pos]?.length).map(pos => {
      const rows = sortDataRows(groupedDataPlayers[pos])
      const count = rows.length

      return (
        <div key={pos} className="mb-8">
          <h2 className="text-xl font-semibold mb-3">
            {posLabel[pos]} <span className="text-slate-400 text-sm font-medium">({count} players)</span>
          </h2>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 overflow-x-auto">
            {!hasAnyDataTabCols ? (
              <div className="p-3 text-slate-300">
                No matching Player Data columns found in the current LeagueContext table.
              </div>
            ) : (
              <table className="min-w-full border-collapse text-sm table-auto">
                <thead>
                  <tr className="bg-slate-700 text-orange-400">
                    {dataTabHeaders.map(h => (
                      <th
                        key={h}
                        onClick={() => handleDataSort(h)}
                        className={[
                          "p-2 text-left whitespace-nowrap cursor-pointer select-none",
                          h === "Player" ? "w-max" : ""
                        ].join(" ")}
                        title="Click to sort"
                      >
                        <span className="inline-flex items-center gap-2">
                          {displayMap?.[h] || h}
                          {dataSortConfig.key === h ? (
                            <span className="text-[11px] text-orange-200">
                              {dataSortConfig.direction === "asc" ? "▲" : "▼"}
                            </span>
                          ) : null}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-700 hover:bg-slate-800">
                      {dataTabHeaders.map(h => (
                        <td
                          key={h}
                          className={[
                            "p-2 whitespace-nowrap",
                            h === "Player" ? "min-w-[220px] font-semibold text-slate-100" : "min-w-[90px]"
                          ].join(" ")}
                        >
                          {row?.[h] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )
    })}
  </>
)}

      {/* ================= TRANSACTION HISTORY ================= */}
      <div className="mb-10 bg-slate-800 p-4 rounded">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-orange-400">Transaction History</h2>
            <div className="text-sm text-slate-300">
              {txLoading ? "Loading..." : `${teamTransactionsAll.length} total`}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {TX_TYPES.map(t => (
              <button
                key={t}
                type="button"
                className={filterBtnClass(canonTxType(txFilter) === canonTxType(t))}
                onClick={() => setTxFilter(t)}
              >
                {t}
                <span className="ml-2 text-xs text-slate-300">({countFor(t)})</span>
              </button>
            ))}
          </div>
        </div>

        {txError ? (
          <div className="mt-3 text-red-300">{txError}</div>
        ) : txLoading ? (
          <div className="mt-3 text-slate-300">Loading transactions…</div>
        ) : teamTransactions.length === 0 ? (
          <div className="mt-3 text-slate-300">No {txFilter} transactions found.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {teamTransactions.map(tx => (
              <details key={tx.txId} className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="font-semibold text-slate-100">
                      {tx.date} • <span className="text-orange-300">{tx.type}</span>
                    </div>
                    <div className="text-sm text-slate-300">
                      {tx.teamA || "-"}
                      {isTrade(tx.type) ? " ↔ " : " → "}
                      {isTrade(tx.type) ? tx.teamB || "-" : ""}
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-slate-200">
                    <span className="text-slate-400">Sent:</span> {tx.sent.length ? tx.sent.join(", ") : "-"}
                  </div>

                  {isTrade(tx.type) ? (
                    <div className="mt-1 text-sm text-slate-200">
                      <span className="text-slate-400">Received:</span> {tx.received.length ? tx.received.join(", ") : "-"}
                    </div>
                  ) : null}

                  <div className="mt-2 text-xs text-slate-400">Click to expand details</div>
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
                          <td className="py-2 pr-4 text-slate-200">{l.teamA || "-"}</td>
                          <td className="py-2 pr-4 text-slate-200">{l.assetA || "-"}</td>
                          <td className="py-2 pr-4 text-slate-200">{l.salaryA || "-"}</td>
                          <td className="py-2 pr-4 text-slate-200">{l.teamB || ""}</td>
                          <td className="py-2 pr-4 text-slate-200">{l.assetB || "-"}</td>
                          <td className="py-2 pr-4 text-slate-200">{l.salaryB || "-"}</td>
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
    </div>
  )
}