// src/utils/fetchPlayerOptions.js

const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ"
const PLAYER_OPTIONS_GID = 556243297

function stripGviz(text) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("Invalid gviz response")
  return JSON.parse(text.slice(start, end + 1))
}

function cellValue(c) {
  if (!c) return ""
  if (c.f != null) return String(c.f).trim()
  if (c.v == null) return ""
  return String(c.v).trim()
}

function normName(x) {
  return String(x ?? "")
    .replace(/\r/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function isYear(x) {
  return /^\d{4}$/.test(String(x ?? "").trim())
}

function asYear(x) {
  const s = String(x ?? "").trim()
  if (isYear(s)) return s
  // sometimes gviz gives 2021.0 (number) -> "2021"
  const n = Number(s)
  if (Number.isFinite(n) && n >= 1900 && n <= 2100) return String(Math.trunc(n))
  return ""
}

// Find the row that contains header labels like "Player" and multiple year values.
function findMatrixHeaderRow(rows, playerKey, allKeys) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i]
    const p = String(r[playerKey] ?? "").trim().toLowerCase()
    if (p !== "player") continue

    let yearCount = 0
    for (const k of allKeys) {
      if (k === playerKey) continue
      const y = asYear(r[k])
      if (y) yearCount++
    }
    if (yearCount >= 3) return { row: r, index: i }
  }
  return { row: null, index: -1 }
}

// Determine playerKey: pick the column where the header row says "Player"
function detectPlayerKey(rows, keys) {
  for (const r of rows.slice(0, 5)) {
    for (const k of keys) {
      if (String(r[k] ?? "").trim().toLowerCase() === "player") return k
    }
  }
  // fallback
  return keys[0] || "__col_0"
}

export async function fetchPlayerOptions(signal) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${PLAYER_OPTIONS_GID}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Fetch player options failed (${res.status})`)

  const text = await res.text()
  const json = stripGviz(text)

  const table = json?.table
  const cols = table?.cols || []
  const rows = table?.rows || []

  // gviz cols have blank labels -> we use stable keys __col_0..n
  const safeHeaders = cols.map((_, i) => `__col_${i}`)

  const data = rows.map(r => {
    const obj = {}
    const cells = r?.c || []
    for (let i = 0; i < safeHeaders.length; i++) {
      obj[safeHeaders[i]] = cellValue(cells[i])
    }
    return obj
  })

  // 1) detect which column is the "Player" label in the header row
  const playerKey = detectPlayerKey(data, safeHeaders)

  // 2) find the matrix header row (where playerKey cell is "Player")
  const { row: headerRow, index: headerRowIndex } = findMatrixHeaderRow(
    data,
    playerKey,
    safeHeaders
  )

  if (!headerRow) {
    // still return raw so you can debug in UI
    return { headers: safeHeaders, rows: data, yearKeys: [], byPlayerYear: {}, playerKey, colToYear: {} }
  }

  // 3) build colToYear mapping from that header row
  const colToYear = {}
  for (const k of safeHeaders) {
    const y = asYear(headerRow[k])
    if (y) colToYear[k] = y
  }

  const yearKeys = Array.from(new Set(Object.values(colToYear))).sort()

  // 4) build byPlayerYear index (skip header row + skip any non-player rows)
  const byPlayerYear = {}

  data.forEach((r, idx) => {
    if (idx === headerRowIndex) return

    const player = String(r[playerKey] ?? "").trim()
    if (!player) return
    if (player.toLowerCase() === "player") return

    const pKey = normName(player)
    if (!byPlayerYear[pKey]) byPlayerYear[pKey] = {}

    for (const [colKey, y] of Object.entries(colToYear)) {
      const v = String(r[colKey] ?? "").trim().toUpperCase()
      if (v === "T" || v === "P") byPlayerYear[pKey][y] = v
    }
  })

  return {
    headers: safeHeaders,
    rows: data,
    yearKeys,
    byPlayerYear,
    playerKey,
    colToYear,
    headerRowIndex
  }
}

export function optionLabel(tp) {
  if (tp === "T") return "Team Option"
  if (tp === "P") return "Player Option"
  return ""
}

export function getOptionForPlayerYear(byPlayerYear, playerName, year) {
  const pKey = normName(playerName)
  const yKey = String(year ?? "").trim()
  return byPlayerYear?.[pKey]?.[yKey] || ""
}