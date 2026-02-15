import { useLeague } from "../context/LeagueContext"
import { useState, useMemo } from "react"
import { Link } from "react-router-dom"

export default function Players() {
  const { table, loading, error } = useLeague()
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "asc"
  })

  const { headers = [], data = [], displayMap = {} } = table || {}
  const currentYear = new Date().getFullYear()

  // 🔥 Find Player column start
  const playerIndex = headers.findIndex(h =>
    h?.toLowerCase().startsWith("player")
  )

  const candidateHeaders = playerIndex !== -1 ? headers.slice(playerIndex) : []

  // 🔥 Columns to hide by base name
  const hiddenBases = ["Tier", "Rank Discount", "Fantrax code", "Age factor Next offseason", "Initial Draft bid"]

  // 🔥 Filter visible headers
  const visibleHeaders = candidateHeaders.filter(header => {
    const base = header.split("_")[0].trim()

    // Hide specific columns
    if (hiddenBases.includes(base)) return false

    // Hide second Player column
    if (base.toLowerCase() === "player" && header.toLowerCase() !== "player")
      return false

    // Hide past numeric year columns
    const year = parseInt(base)
    if (!isNaN(year)) return year >= currentYear

    return true
  })

  // ✅ Identify the exact Player header used in visibleHeaders
  const playerHeader = visibleHeaders.find(
    h => h.split("_")[0].trim().toLowerCase() === "player"
  )

  // 🔥 Find Rank column robustly
  const rankHeader = headers.find(h => {
    const base = h.split("_")[0]
    return base.trim().toLowerCase() === "rank"
  })

  // 🔥 Remove rows without Rank
  const filteredData = rankHeader
    ? data.filter(row => {
        const value = row[rankHeader]
        return value !== undefined && value !== null && value.toString().trim() !== ""
      })
    : data

  // 🔥 Sorting
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData

    return [...filteredData].sort((a, b) => {
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
  }, [filteredData, sortConfig])

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }))
  }

  if (loading) return <div className="p-6 text-white">Loading...</div>
  if (error) return <div className="p-6 text-red-500">{error}</div>
  if (!visibleHeaders.length) return null

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-white overflow-x-auto">
      <h1 className="text-2xl font-bold mb-6">Players</h1>

      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-700 text-orange-400">
            {visibleHeaders.map(header => (
              <th
                key={header}
                onClick={() => handleSort(header)}
                className="p-3 text-left cursor-pointer select-none hover:text-white"
              >
                {displayMap?.[header] || header}
                {sortConfig.key === header && (
                  <span className="ml-2">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sortedData.map((row, index) => (
            <tr
              key={index}
              className="border-b border-slate-700 hover:bg-slate-800"
            >
              {visibleHeaders.map(header => {
                const base = header.split("_")[0].trim()
                const isYear = !isNaN(parseInt(base))
                const isPlayerCell = playerHeader && header === playerHeader

                return (
                  <td
                    key={header}
                    className={`p-3 ${isYear ? "text-right" : ""}`}
                  >
                    {isPlayerCell ? (
                      <Link
                        to={`/player/${encodeURIComponent(row[playerHeader] || "")}`}
                        className="text-orange-400 hover:underline"
                      >
                        {row[playerHeader]}
                      </Link>
                    ) : (
                      row[header]
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}