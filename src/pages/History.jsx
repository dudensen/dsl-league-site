// src/pages/History.jsx
import React, { useEffect, useMemo, useState } from "react"
import { fetchHistoryTable } from "../utils/fetchHistory"

/* ----------------------------- helpers ----------------------------- */

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

function uniqueSorted(list) {
  return Array.from(new Set(list.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  )
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

function findColKey(cols, headerName) {
  const target = norm(headerName)
  const hit = (cols || []).find(c => norm(c.header) === target)
  return hit?.key || null
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

const isYear = v => /\b\d{4}\b/.test(String(v))
const isTotal = v => norm(v) === "total"
const isRecords = v => norm(v) === "records"

function buildCategories(rawCatRow, baseCount) {
  const raw = rawCatRow.map(s)
  const out = new Array(raw.length).fill("")

  for (let i = 0; i < raw.length; i++) {
    if (i < baseCount) continue
    if (raw[i] && !isYear(raw[i])) out[i] = raw[i]
  }

  // Year anchors: category spans [i-1,i,i+1]
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i]
    if (!isYear(v)) continue

    const left = i - 1
    const mid = i
    const right = i + 1

    if (mid >= baseCount) out[mid] = v
    if (left >= baseCount && !raw[left]) out[left] = v
    if (right < raw.length && right >= baseCount && !raw[right]) out[right] = v
  }

  // fill-forward for non-year categories
  let lastNonYear = ""
  for (let i = 0; i < out.length; i++) {
    if (i < baseCount) continue
    if (out[i] && !isYear(out[i])) lastNonYear = out[i]
    if (!out[i] && lastNonYear) out[i] = lastNonYear
  }

  return out
}

function findBandAnchorIndex(rawCatRow, band, baseCount) {
  const b = s(band)
  for (let i = baseCount; i < rawCatRow.length; i++) {
    if (s(rawCatRow[i]) === b) return i
  }
  return -1
}

// Infer Total/Records blocks by position from the end (stable even if you add more years)
function inferSpecialBandsByPosition(colCount, baseCount) {
  const recordsIdxs = [colCount - 3, colCount - 2, colCount - 1].filter(i => i >= baseCount)
  const totalIdxs = [colCount - 6, colCount - 5, colCount - 4].filter(i => i >= baseCount)

  return {
    totalIdxs: totalIdxs.length === 3 ? totalIdxs : [],
    recordsIdxs: recordsIdxs.length === 3 ? recordsIdxs : []
  }
}

function getBandIndices({ rawCatRow, categories, band, baseCount, specialBands }) {
  if (!band) return []

  if (isYear(band)) {
    const anchor = findBandAnchorIndex(rawCatRow, band, baseCount)
    if (anchor < 0) {
      const first = categories.findIndex((c, idx) => idx >= baseCount && s(c) === s(band))
      if (first < 0) return []
      return [first, first + 1, first + 2].filter(i => i >= baseCount && i < categories.length)
    }
    return [anchor - 1, anchor, anchor + 1].filter(i => i >= baseCount && i < categories.length)
  }

  if (isTotal(band)) return (specialBands?.totalIdxs || []).slice(0, 3)
  if (isRecords(band)) return (specialBands?.recordsIdxs || []).slice(0, 3)

  const idxs = []
  for (let i = baseCount; i < categories.length; i++) {
    if (s(categories[i]) === s(band)) idxs.push(i)
  }
  return idxs.slice(0, 3)
}

function labelYearBandHeaders(headersRow, bandIdxs) {
  const headers = [...headersRow]
  const labels = ["Record W%", "Fpts/G Adjusted", "Playoffs"]
  for (let k = 0; k < bandIdxs.length; k++) {
    headers[bandIdxs[k]] = labels[k] || headers[bandIdxs[k]] || ""
  }
  return headers
}

function labelSpecialBandHeaders(headersRow, band, bandIdxs) {
  const headers = [...headersRow]
  if (isTotal(band)) {
    const labels = ["Record W%", "Fpts/G Adjusted", "Playoffs Appearances"]
    for (let k = 0; k < bandIdxs.length; k++) headers[bandIdxs[k]] = labels[k] || ""
  } else if (isRecords(band)) {
    const labels = ["Best Record W%", "Best Fpts/G Adjusted", "Best Playoffs"]
    for (let k = 0; k < bandIdxs.length; k++) headers[bandIdxs[k]] = labels[k] || ""
  }
  return headers
}

/** Turn tenths-of-percent integers into "x,y%" (Greek comma) */
function formatTenthsPercent(raw) {
  const t = s(raw)
  if (!t) return ""
  const cleaned = t.replace(/,/g, ".")
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return raw
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return raw
  const pct = n / 10
  return `${pct.toFixed(1).replace(".", ",")}%`
}

function parseHistoryGrid(grid) {
  const rows = Array.isArray(grid) ? grid : []
  if (rows.length < 2) {
    return {
      ok: false,
      error: "History sheet must have at least 2 rows (row 0 categories, row 1 headers).",
      years: [],
      baseCols: [],
      data: [],
      allCols: [],
      baseCount: 0,
      categories: [],
      headersRow: [],
      rawCatRow: [],
      specialBands: { totalIdxs: [], recordsIdxs: [] }
    }
  }

  const catRowRaw = rows[0] || []
  const headerRowRaw = rows[1] || []
  const colCount = Math.max(catRowRaw.length, headerRowRaw.length)

  const rawCatRow = new Array(colCount).fill("").map((_, i) => s(catRowRaw[i]))
  const headerRow = new Array(colCount).fill("").map((_, i) => s(headerRowRaw[i]))

  const baseCount = getBaseCount(headerRow)
  const categories = buildCategories(rawCatRow, baseCount)

  const uniqueHeaders = buildUniqueKeys(headerRow)
  const cols = uniqueHeaders.map((key, idx) => ({
    idx,
    key,
    header: headerRow[idx] || key,
    category: categories[idx] || ""
  }))

  const baseCols = cols.slice(0, Math.min(baseCount, cols.length))
  const specialBands = inferSpecialBandsByPosition(colCount, baseCount)

  const years = uniqueSorted(
    cols
      .slice(baseCount)
      .map(c => c.category || "")
      .filter(v => v && isYear(v))
  ).sort((a, b) => Number(b) - Number(a))

  const data = []
  for (let r = 2; r < rows.length; r++) {
    const rowRaw = rows[r] || []
    const row = new Array(colCount).fill("").map((_, i) => s(rowRaw[i]))

    const rowHasAnything = row.some(v => v)
    const baseHasAnything = row.slice(0, baseCount).some(v => v)
    if (!rowHasAnything || !baseHasAnything) break // ignore EVERYTHING below first empty base row

    const obj = {}
    for (const c of cols) obj[c.key] = row[c.idx] ?? ""
    data.push(obj)
  }

  return {
    ok: true,
    error: "",
    years,
    baseCols,
    data,
    allCols: cols,
    baseCount,
    categories,
    headersRow: headerRow,
    rawCatRow,
    specialBands
  }
}

/* ----------------------------- component ----------------------------- */

export default function History() {
  const [grid, setGrid] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  const parsed = useMemo(() => parseHistoryGrid(grid), [grid])

  const [band, setBand] = useState("")
  const [conf, setConf] = useState("All")
  const [div, setDiv] = useState("All")
  const [q, setQ] = useState("")

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        setErr("")
        const res = await fetchHistoryTable()
        const nextGrid = res?.grid
        if (!Array.isArray(nextGrid)) throw new Error("fetchHistoryTable() must return { grid }")
        if (!alive) return
        setGrid(nextGrid)
      } catch (e) {
        if (!alive) return
        setErr(String(e?.message || e))
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!parsed.ok) return
    if (band) return
    if (parsed.years[0]) setBand(parsed.years[0])
    else setBand("Total")
  }, [parsed.ok, parsed.years, band])

  const confKey = useMemo(() => findColKey(parsed.baseCols, "Conference"), [parsed.baseCols])
  const divKey = useMemo(() => findColKey(parsed.baseCols, "Division"), [parsed.baseCols])

  const conferenceOptions = useMemo(() => {
    if (!parsed.ok || !confKey) return []
    return uniqueSorted(parsed.data.map(r => r[confKey]))
  }, [parsed.ok, parsed.data, confKey])

  const divisionOptions = useMemo(() => {
    if (!parsed.ok || !divKey) return []
    const rows =
      conf !== "All" && confKey ? parsed.data.filter(r => s(r[confKey]) === conf) : parsed.data
    return uniqueSorted(rows.map(r => r[divKey]))
  }, [parsed.ok, parsed.data, divKey, conf, confKey])

  const bandIdxs = useMemo(() => {
    if (!parsed.ok || !band) return []
    return getBandIndices({
      rawCatRow: parsed.rawCatRow,
      categories: parsed.categories,
      band,
      baseCount: parsed.baseCount,
      specialBands: parsed.specialBands
    })
  }, [parsed.ok, parsed.rawCatRow, parsed.categories, band, parsed.baseCount, parsed.specialBands])

  const displayHeadersRow = useMemo(() => {
    if (!parsed.ok) return []
    if (!bandIdxs.length) return parsed.headersRow
    if (/^\d{4}$/.test(String(band))) return labelYearBandHeaders(parsed.headersRow, bandIdxs)
    return labelSpecialBandHeaders(parsed.headersRow, band, bandIdxs)
  }, [parsed.ok, parsed.headersRow, bandIdxs, band])

  const visibleCols = useMemo(() => {
    if (!parsed.ok) return []
    const base = parsed.baseCols || []

    const renameUIHeader = hdr => {
      const nh = norm(hdr)
      if (nh === "division") return "Div"
      if (nh === "conference") return "Conf"
      if (/champs\s*\/\s*finals/.test(nh)) return "Awards"
      return hdr
    }

    // ✅ hide Awards unless Total/Records
    const showAwards = isTotal(band) || isRecords(band)

    const baseRenamed = base
      .map(c => ({ ...c, header: renameUIHeader(c.header) }))
      .filter(c => {
        if (!showAwards) return norm(c.header) !== "awards"
        return true
      })

    const extras = bandIdxs
      .map(idx => parsed.allCols.find(c => c.idx === idx))
      .filter(Boolean)
      .map(c => {
        const hdr = displayHeadersRow[c.idx] || c.header
        return { ...c, header: renameUIHeader(hdr) }
      })

    return [...baseRenamed, ...extras]
  }, [parsed.ok, parsed.baseCols, parsed.allCols, bandIdxs, displayHeadersRow, band])

  const baseCount = useMemo(() => {
    if (!parsed.ok) return 0
    // baseCount for rendering must match visibleCols split
    // base columns are first N of visibleCols that came from baseRenamed
    // We can recompute from the base keys that are present.
    const baseKeys = new Set((parsed.baseCols || []).map(c => c.key))
    let n = 0
    for (const c of visibleCols) {
      if (baseKeys.has(c.key)) n++
      else break
    }
    return n
  }, [parsed.ok, parsed.baseCols, visibleCols])

  const bandCount = Math.max(0, visibleCols.length - baseCount)

  const filtered = useMemo(() => {
    if (!parsed.ok) return []
    const qq = norm(q)
    let rows = parsed.data || []

    if (conf !== "All" && confKey) rows = rows.filter(r => s(r[confKey]) === conf)
    if (div !== "All" && divKey) rows = rows.filter(r => s(r[divKey]) === div)

    if (qq) {
      const baseKeys = (parsed.baseCols || []).map(c => c.key)
      rows = rows.filter(row => baseKeys.map(k => norm(row[k])).join(" ").includes(qq))
    }
    return rows
  }, [parsed.ok, parsed.data, parsed.baseCols, q, conf, div, confKey, divKey])

  const baseSafetyMinW = header => {
    const h = norm(header)
    if (h === "team") return "min-w-[120px]"
    return ""
  }

  // TradeAnalyzer-like pill buttons
  const pillBtn = active =>
    [
      "px-3 py-1.5 rounded-xl border text-sm font-semibold transition-colors",
      active
        ? "bg-slate-900/70 text-slate-100 border-slate-500"
        : "bg-slate-950/30 hover:bg-slate-900/40 border-slate-700/70 text-slate-200"
    ].join(" ")

  const usingSpecial = isTotal(band) || isRecords(band)
  const specialMissing = usingSpecial && bandIdxs.length === 0

  const isRecordPercentCol = header => {
    const h = norm(header)
    return h === "record w%" || h === "best record w%"
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-2xl font-bold text-slate-100">History</div>
        <div className="mt-3 text-sm text-slate-400">Loading…</div>
      </div>
    )
  }

  if (err) {
    return (
      <div className="p-6">
        <div className="text-2xl font-bold text-slate-100">History</div>
        <div className="mt-3 text-sm font-semibold text-red-400">Failed</div>
        <div className="mt-2 text-sm text-slate-300">{err}</div>
      </div>
    )
  }

  if (!parsed.ok) {
    return (
      <div className="p-6">
        <div className="text-2xl font-bold text-slate-100">History</div>
        <div className="mt-3 text-sm text-slate-300">{parsed.error}</div>
      </div>
    )
  }

  const yearValueForDropdown = isYear(band) ? band : parsed.years[0] || ""

  return (
    <div className="p-6 space-y-6 text-slate-100">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/20 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="text-2xl font-bold">League History</div>
        <div className="text-xs text-slate-400 mt-2">
          Choose a year, or use <span className="font-semibold text-slate-200">Total</span> /{" "}
          <span className="font-semibold text-slate-200">Records</span> to see league summaries.
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
          {/* Year + pills */}
          <div className="lg:col-span-4">
            {/* ✅ pills ABOVE the dropdown */}
            <label className="text-[11px] font-semibold text-slate-200">Band</label>
            <div className="mt-2 flex gap-2">
              <button type="button" className={pillBtn(isTotal(band))} onClick={() => setBand("Total")}>
                Total
              </button>
              <button type="button" className={pillBtn(isRecords(band))} onClick={() => setBand("Records")}>
                Records
              </button>
            </div>

            <div className="mt-3">
              <label className="text-[11px] font-semibold text-slate-200">Year</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-orange-500/30"
                value={yearValueForDropdown}
                onChange={e => setBand(e.target.value)}
              >
                {parsed.years.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              {usingSpecial && (
                <div className="mt-2 text-[11px] text-slate-400">
                  Showing: <span className="font-semibold text-slate-200">{band}</span>
                </div>
              )}
            </div>
          </div>

          {/* Conf */}
          <div className="lg:col-span-3">
            <label className="text-[11px] font-semibold text-slate-200">Conference</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-orange-500/30"
              value={conf}
              onChange={e => {
                setConf(e.target.value)
                setDiv("All")
              }}
            >
              <option value="All">All</option>
              {conferenceOptions.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Div */}
          <div className="lg:col-span-3">
            <label className="text-[11px] font-semibold text-slate-200">Division</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-orange-500/30"
              value={div}
              onChange={e => setDiv(e.target.value)}
            >
              <option value="All">All</option>
              {divisionOptions.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-200">Search team</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500/30"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="e.g. Samarina, Ducks…"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/30 px-3 py-1 text-xs text-slate-300">
            <span>Rows</span>
            <span className="font-semibold text-slate-100">{filtered.length}</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/30 px-3 py-1 text-xs text-slate-300">
            <span>Cols</span>
            <span className="font-semibold text-slate-100">{visibleCols.length}</span>
          </span>
        </div>

        {specialMissing && (
          <div className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            Could not detect columns for <span className="font-semibold">{band}</span>. (Unexpected column count)
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="overflow-hidden rounded-2xl">
          <div className="overflow-auto">
            <table className="table-auto text-sm w-max min-w-full">
              <thead className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur">
                <tr>
                  {baseCount > 0 && (
                    <th
                      colSpan={baseCount}
                      className="sticky left-0 z-30 border-b border-slate-800/70 bg-slate-950/90 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                    >
                      &nbsp;
                    </th>
                  )}
                  {bandCount > 0 && (
                    <th
                      colSpan={bandCount}
                      className="border-b border-slate-800/70 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-300"
                    >
                      {band || "—"}
                    </th>
                  )}
                </tr>

                <tr>
                  {visibleCols.map((c, idx) => {
                    const isBaseCol = idx < baseCount
                    const safety = isBaseCol ? baseSafetyMinW(c.header) : ""
                    return (
                      <th
                        key={c.key}
                        className={[
                          "whitespace-nowrap border-b border-slate-800/70 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-300",
                          isBaseCol ? "sticky left-0 z-30 bg-slate-950/90" : "",
                          "w-max",
                          safety
                        ].join(" ")}
                        title={c.header}
                      >
                        {c.header || "—"}
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {filtered.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className={[
                      "border-b border-slate-800/50",
                      rIdx % 2 === 0 ? "bg-slate-950/10" : "bg-transparent",
                      "hover:bg-slate-900/30 transition-colors"
                    ].join(" ")}
                  >
                    {visibleCols.map((c, idx) => {
                      const raw = row[c.key]
                      const isBaseCol = idx < baseCount
                      const safety = isBaseCol ? baseSafetyMinW(c.header) : ""
                      const val = isRecordPercentCol(c.header) ? formatTenthsPercent(raw) : raw

                      return (
                        <td
                          key={c.key}
                          className={[
                            "whitespace-nowrap px-3 py-3 text-slate-100",
                            isBaseCol ? "sticky left-0 z-10 bg-slate-950/60" : "",
                            "w-max",
                            safety,
                            !val ? "text-slate-400" : ""
                          ].join(" ")}
                          title={val ? String(val) : ""}
                        >
                          {val ? val : "—"}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {!filtered.length && (
                  <tr>
                    <td
                      colSpan={Math.max(1, visibleCols.length)}
                      className="px-4 py-10 text-center text-sm text-slate-400"
                    >
                      No rows match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-500">DYNASTY SUMMER LEAGUE</div>
    </div>
  )
}