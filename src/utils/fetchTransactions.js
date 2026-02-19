// src/utils/fetchTransactions.js

function unwrapGviz(text) {
  const m = String(text ?? "").match(/setResponse\(([\s\S]*?)\);?\s*$/)
  if (!m) throw new Error("GViz response could not be unwrapped")
  return JSON.parse(m[1])
}

function cellToString(c) {
  if (!c) return ""
  if (c.f != null) return String(c.f).replace(/\r/g, "").trim()
  if (c.v == null) return ""
  return String(c.v).replace(/\r/g, "").trim()
}

export async function fetchTransactionsRows() {
  const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ"
  const TRANSACTIONS_GID = "403962102"

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${TRANSACTIONS_GID}`

  const res = await fetch(url)
  const text = await res.text()
  const json = unwrapGviz(text)

  const table = json?.table
  const rows = table?.rows || []

  const out = []

  // carry-down values
  let lastDate = ""
  let lastType = ""
  let lastTeamA = ""
  let lastTeamB = ""

  // ✅ transaction block id: increments when raw Date exists
  let txId = -1

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx]
    const c = r?.c || []

    const rawDate = cellToString(c[0]) // col A
    const rawType = cellToString(c[1]) // col B
    const rawTeamA = cellToString(c[2]) // col C
    const rawTeamB = cellToString(c[6]) // col G

    // ✅ new block starts when Date cell is non-empty
    if (rawDate) txId++

    // carry down within the block
    if (rawDate) lastDate = rawDate
    if (rawType) lastType = rawType
    if (rawTeamA) lastTeamA = rawTeamA
    if (rawTeamB) lastTeamB = rawTeamB

    out.push({
      txId,
      rowIndex: idx,

      date: rawDate || lastDate,
      type: rawType || lastType,

      teamA: rawTeamA || lastTeamA,
      assetA: cellToString(c[3]),
      salaryA: cellToString(c[4]),
      rookie: cellToString(c[5]),

      teamB: rawTeamB || lastTeamB,
      assetB: cellToString(c[7]),
      salaryB: cellToString(c[8])
    })
  }

  return out
}