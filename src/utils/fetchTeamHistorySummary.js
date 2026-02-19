// src/utils/fetchTeamHistorySummary.js
import { fetchHistoryTable } from "./fetchHistory"

function s(x) {
  return String(x ?? "").replace(/\r/g, "").trim()
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

function buildUniqueKeys(headers) {
  const seen = new Map()
  return headers.map(h => {
    const key = s(h)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return n === 1 ? key : `${key} (${n})`
  })
}

function getBaseCount(headersRow) {
  const headers = headersRow.map(h => norm(h))
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

function parseGridToRows(grid) {
  const rows = Array.isArray(grid) ? grid : []
  if (rows.length < 2) return { cols: [], data: [], baseCount: 0 }

  const catRowRaw = rows[0] || []
  const headerRowRaw = rows[1] || []
  const colCount = Math.max(catRowRaw.length, headerRowRaw.length)

  const headerRow = new Array(colCount).fill("").map((_, i) => s(headerRowRaw[i]))
  const baseCount = getBaseCount(headerRow)

  const uniqueHeaders = buildUniqueKeys(headerRow)
  const cols = uniqueHeaders.map((key, idx) => ({
    idx,
    key,
    header: headerRow[idx] || key
  }))

  const data = []
  for (let r = 2; r < rows.length; r++) {
    const rowRaw = rows[r] || []
    const row = new Array(colCount).fill("").map((_, i) => s(rowRaw[i]))

    const rowHasAnything = row.some(v => v)
    const baseHasAnything = row.slice(0, baseCount).some(v => v)
    if (!rowHasAnything || !baseHasAnything) break // stop at first empty base row (ignore everything below)

    const obj = {}
    for (const c of cols) obj[c.key] = row[c.idx] ?? ""
    data.push(obj)
  }

  return { cols, data, baseCount }
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

export async function fetchTeamHistorySummary() {
  const res = await fetchHistoryTable()
  const grid = res?.grid
  if (!Array.isArray(grid)) throw new Error("fetchHistoryTable() must return { grid }")

  const { cols, data } = parseGridToRows(grid)

  // Base fields (team + awards)
  const teamKey = findColKey(cols, "Team")
  const awardsKey =
    findColKey(cols, "Champs / Finals") ||
    findColKey(cols, "Champs/Finals")

  // Records “best” fields (from your sheet)
  const bestRecordKey = findColKey(cols, "Best Record W%")
  const bestFptsKey = findColKey(cols, "Best Fpts/G Adjusted")
  const bestPlayoffsKey = findColKey(cols, "Best Playoffs")

  // If some are missing (headers might be blank), we can still try fallback by scanning last 3 columns
  // but ONLY if needed.
  const bestKeysOk = bestRecordKey && bestFptsKey && bestPlayoffsKey

  const byTeam = {}

  for (const row of data) {
    const team = teamKey ? s(row[teamKey]) : ""
    if (!team) continue

    let bestRecord = bestRecordKey ? s(row[bestRecordKey]) : ""
    let bestFpts = bestFptsKey ? s(row[bestFptsKey]) : ""
    let bestPlayoffs = bestPlayoffsKey ? s(row[bestPlayoffsKey]) : ""

    if (!bestKeysOk) {
      // fallback: last 3 columns in the row object order
      const keys = cols.map(c => c.key)
      const last3 = keys.slice(-3)
      bestRecord = bestRecord || s(row[last3[0]])
      bestFpts = bestFpts || s(row[last3[1]])
      bestPlayoffs = bestPlayoffs || s(row[last3[2]])
    }

    byTeam[norm(team)] = {
      team,
      awards: awardsKey ? s(row[awardsKey]) : "",
      bestRecordW: bestRecord ? formatTenthsPercent(bestRecord) : "",
      bestFptsAdjusted: bestFpts,
      bestPlayoffs: bestPlayoffs
    }
  }

  return byTeam
}