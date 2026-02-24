// src/pages/PlayerOptions.jsx
import { useEffect, useMemo, useState } from "react"
import { fetchPlayerOptions, optionLabel } from "../utils/fetchPlayerOptions"

function Badge({ tp }) {
  if (!tp) return null
  const isT = tp === "T"
  const text = isT ? "TO" : "PO"
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border",
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

export default function PlayerOptions() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState([])
  const [yearKeys, setYearKeys] = useState([])
  const [byPlayerYear, setByPlayerYear] = useState({})
  const [playerKey, setPlayerKey] = useState("__col_0")
  const [colToYear, setColToYear] = useState({})
  const [headerRowIndex, setHeaderRowIndex] = useState(-1)

  const [q, setQ] = useState("")
  const [year, setYear] = useState("")
  const [onlyWithOptions, setOnlyWithOptions] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError("")

    fetchPlayerOptions(ac.signal)
      .then(res => {
        setRows(res.rows || [])
        setYearKeys(res.yearKeys || [])
        setByPlayerYear(res.byPlayerYear || {})
        setPlayerKey(res.playerKey || "__col_0")
        setColToYear(res.colToYear || {})
        setHeaderRowIndex(Number.isFinite(res.headerRowIndex) ? res.headerRowIndex : -1)
      })
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [])

  const totalOptionsCount = useMemo(() => {
    let c = 0
    for (const p of Object.values(byPlayerYear)) c += Object.keys(p).length
    return c
  }, [byPlayerYear])

  // Map year -> column key (we built it from the header row)
  const yearToColKey = useMemo(() => {
    const m = {}
    for (const [colKey, y] of Object.entries(colToYear)) {
      m[y] = colKey
    }
    return m
  }, [colToYear])

  const yearsToShow = useMemo(() => (year ? [String(year)] : yearKeys), [year, yearKeys])

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase()

    return rows.filter((r, idx) => {
      if (idx === headerRowIndex) return false

      const name = String(r[playerKey] ?? "").trim()
      if (!name) return false
      if (name.toLowerCase() === "player") return false

      const okQ = !qq || name.toLowerCase().includes(qq)
      if (!okQ) return false

      if (!onlyWithOptions) return true

      const checkYears = year ? [String(year)] : yearKeys
      return checkYears.some(y => {
        const colKey = yearToColKey[y]
        if (!colKey) return false
        const v = String(r[colKey] ?? "").trim().toUpperCase()
        return v === "T" || v === "P"
      })
    })
  }, [rows, q, onlyWithOptions, playerKey, year, yearKeys, yearToColKey, headerRowIndex])

  if (loading) return <div className="p-6 text-slate-200">Loading player options…</div>

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/30 border border-red-500/40 text-red-200 rounded-xl p-4">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-orange-400">Player Options</h1>
          <p className="text-slate-300">
            Detected player column: <span className="text-slate-100 font-semibold">{playerKey}</span>
            {" • "}Years:{" "}
            <span className="text-slate-100 font-semibold">
              {yearKeys?.length ? yearKeys.join(", ") : "NONE"}
            </span>
            {" • "}Options indexed:{" "}
            <span className="text-slate-100 font-semibold">{totalOptionsCount}</span>
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <input
            className="px-3 py-2 rounded-lg bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
            placeholder="Search player…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />

          <select
            className="px-3 py-2 rounded-lg bg-slate-800 text-slate-100 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
            value={year}
            onChange={e => setYear(e.target.value)}
            disabled={!yearKeys.length}
          >
            <option value="">All years</option>
            {yearKeys.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 select-none">
            <input
              type="checkbox"
              checked={onlyWithOptions}
              onChange={e => setOnlyWithOptions(e.target.checked)}
            />
            Only with options
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="text-left px-3 py-2 text-slate-200 border-b border-slate-700">
                Player
              </th>
              {yearsToShow.map(y => (
                <th
                  key={y}
                  className="text-left px-3 py-2 text-slate-200 border-b border-slate-700 whitespace-nowrap"
                >
                  {y}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="bg-slate-800">
            {filteredRows.map((r, i) => {
              const name = String(r[playerKey] ?? "").trim()
              return (
                <tr key={`${name}-${i}`} className="odd:bg-slate-800 even:bg-slate-800/60">
                  <td className="px-3 py-2 text-slate-100 border-b border-slate-700/70 whitespace-nowrap">
                    {name}
                  </td>

                  {yearsToShow.map(y => {
                    const colKey = yearToColKey[y]
                    const tp = colKey ? String(r[colKey] ?? "").trim().toUpperCase() : ""
                    const show = tp === "T" || tp === "P" ? tp : ""
                    return (
                      <td key={y} className="px-3 py-2 border-b border-slate-700/70">
                        {show ? <Badge tp={show} /> : <span className="text-slate-500">—</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {!filteredRows.length && (
              <tr>
                <td className="px-3 py-6 text-slate-300" colSpan={1 + yearsToShow.length}>
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}