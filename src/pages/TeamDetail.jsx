import { useLeague } from "../context/LeagueContext"
import { useParams } from "react-router-dom"
import { useState, useEffect } from "react"
import { fetchTeamSheet } from "../utils/fetchTeamSheet"
import { TEAM_SHEETS } from "../config/teamSheets"

export default function TeamDetail() {
  const { table, loading, error } = useLeague()
  const { teamName } = useParams()

  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "asc"
  })

  const [gmName, setGmName] = useState("")
  const [waiverByYear, setWaiverByYear] = useState({})

  // picksByYear shape:
  // { 2026: { A: ["Team1", "Team2"], B: ["TeamX"] }, ... }
  const [picksByYear, setPicksByYear] = useState({})

  const { data = [] } = table
  const decodedTeam = decodeURIComponent(teamName)

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3]

  const CAP = 200

  const teamPlayers = data.filter(row => row["Current Owner"] === decodedTeam)

  useEffect(() => {
    async function loadTeamSheet() {
      const teamConfig = TEAM_SHEETS[decodedTeam]
      if (!teamConfig) return

      try {
        const rows = await fetchTeamSheet(teamConfig.gid)

        // ======================================================
        // ✅ DEBUG: dump raw rows
        // ======================================================
        console.log("========== TEAM SHEET DEBUG ==========")
        console.log("Team:", decodedTeam)
        console.log("GID:", teamConfig.gid)
        console.log("Years expected:", years)
        console.log("Raw rows (first 120):", rows?.slice?.(0, 120))
        console.log("======================================")

        // ============================
        // 🔎 Extract GM
        // ============================
        let gmFound = null
        rows.forEach(r => {
          r.forEach(cell => {
            if (typeof cell === "string" && cell.toLowerCase().includes("gm:")) {
              gmFound = cell
            }
          })
        })

        if (gmFound) {
          const match = gmFound.match(/gm:\s*(.*)/i)
          if (match) setGmName(match[1].trim())
        }

        // ============================
        // 🔥 WAIVERS
        // ============================
        const extractedWaivers = {}

        const waiverRow = rows.find(r =>
          r.some(
            cell =>
              typeof cell === "string" && cell.trim().toLowerCase() === "waiver"
          )
        )

        if (waiverRow) {
          const waiverIndex = waiverRow.findIndex(
            cell =>
              typeof cell === "string" && cell.trim().toLowerCase() === "waiver"
          )

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

        // ============================
        // 🔥 PICKS (grouped by year + round)
        // ============================

        const cleanCell = v => String(v ?? "").replace("\r", "").trim()

        const isMarked = v => {
          const s = cleanCell(v).toLowerCase()
          return s === "x" || s === "✓" || s === "1" || s === "yes" || s === "y" || s === "true"
        }

        const parseYear = cell => {
          const s = cleanCell(cell)
          const m = s.match(/\b(20\d{2})\b/)
          return m ? Number(m[1]) : null
        }

        // 1) find "Picks" row
        const picksRowIndex = rows.findIndex(r =>
          r.some(cell => typeof cell === "string" && cell.trim().toLowerCase() === "picks")
        )

        let picksColIndex = -1
        if (picksRowIndex !== -1) {
          picksColIndex = (rows[picksRowIndex] || []).findIndex(
            cell => typeof cell === "string" && cell.trim().toLowerCase() === "picks"
          )
        }

        // In your sheet, pick names are in the SAME column as "Picks" (col 1)
        const pickNameCol = picksColIndex >= 0 ? picksColIndex : 1

        // 2) try to find explicit year columns near picks section
        let yearColumnMap = {} // colIndex -> year

        const candidateHeaderRows = [
          picksRowIndex - 2,
          picksRowIndex - 1,
          picksRowIndex,
          picksRowIndex + 1,
          picksRowIndex + 2,
          picksRowIndex + 3
        ].filter(i => i >= 0 && i < rows.length)

        for (const idx of candidateHeaderRows) {
          const row = rows[idx] || []
          row.forEach((cell, colIndex) => {
            const y = parseYear(cell)
            if (y && years.includes(y)) yearColumnMap[colIndex] = y
          })
          if (Object.keys(yearColumnMap).length > 0) break
        }

        // 3) if no explicit years, infer columns by "x" frequency
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
          topCols.forEach((col, i) => {
            map[col] = years[i]
          })

          return { map, counts, topCols }
        }

        let inferred = null
        if (picksRowIndex !== -1 && Object.keys(yearColumnMap).length === 0) {
          inferred = inferYearColumnsFromMarks()
          yearColumnMap = inferred.map
        }

        console.log("========== PICKS PARSER DEBUG ==========")
        console.log("picksRowIndex:", picksRowIndex)
        console.log("picksColIndex:", picksColIndex)
        console.log("pickNameCol:", pickNameCol)
        console.log("yearColumnMap (col -> year):", yearColumnMap)
        if (inferred) {
          console.log("inferred counts (col -> count):", inferred.counts)
          console.log("inferred topCols:", inferred.topCols)
        }
        console.log("=======================================")

        // 4) build grouped result
        const grouped = {}
        years.forEach(y => {
          grouped[y] = { A: new Set(), B: new Set() }
        })

        const parsePickName = raw => {
          const s = cleanCell(raw)
          const m = s.match(/\s*-\s*([A-Za-z])\s*$/)
          const round = m ? m[1].toUpperCase() : null
          const team = m ? s.replace(/\s*-\s*[A-Za-z]\s*$/, "").trim() : s.trim()
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
                if (round === "A" || round === "B") {
                  grouped[year][round].add(team)
                }
              }
            })
          }
        }

        const finalPicks = {}
        years.forEach(y => {
          finalPicks[y] = {
            A: Array.from(grouped[y].A),
            B: Array.from(grouped[y].B)
          }
        })

        console.log("========== PICKS RESULT DEBUG ==========")
        console.log("finalPicks:", finalPicks)
        console.log("=======================================")

        setPicksByYear(finalPicks)
      } catch (err) {
        console.error("Failed to load team sheet", err)
      }
    }

    loadTeamSheet()
  }, [decodedTeam]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="p-6 text-white">Loading...</div>
  if (error) return <div className="p-6 text-red-500">{error}</div>

  // ============================
  // 🔥 Salary Summary
  // ============================

  const salarySummary = {}

  years.forEach(year => {
    let roster = 0
    let minors = 0

    teamPlayers.forEach(player => {
      const raw = player[String(year)] || ""
      if (!raw) return

      const cleaned = String(raw).replace("$", "").replace("m", "").trim()
      const salary = parseFloat(cleaned)
      if (isNaN(salary)) return

      if (player["Rookie / Minor / Captain"] === "M") {
        minors += salary
      } else {
        roster += salary
      }
    })

    const waiver = waiverByYear[year] || 0

    salarySummary[year] = {
      roster: roster + waiver,
      minors,
      waiver,
      capSpace: CAP - (roster + waiver)
    }
  })

  const positionOrder = ["G", "F", "C"]

  const groupedPlayers = {}
  teamPlayers.forEach(player => {
    const pos = player["Position"] || "Unknown"
    if (!groupedPlayers[pos]) groupedPlayers[pos] = []
    groupedPlayers[pos].push(player)
  })

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }))
  }

  const sortData = players => {
    if (!sortConfig.key) return players

    return [...players].sort((a, b) => {
      let valA = a[sortConfig.key] ?? ""
      let valB = b[sortConfig.key] ?? ""

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

  const renderPickLines = arr => {
    if (!arr || arr.length === 0) return "-"
    return (
      <div className="whitespace-pre-line leading-5">
        {arr.join("\n")}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 text-white">
      <h1 className="text-3xl font-bold text-orange-400 mb-1">{decodedTeam}</h1>

      {gmName && (
        <p className="text-sm text-slate-400 mb-6">
          GM: <span className="text-orange-400">{gmName}</span>
        </p>
      )}

      {/* ================= SALARY SUMMARY ================= */}
      <div className="mb-10 bg-slate-800 p-4 rounded">
        <h2 className="text-lg font-semibold text-orange-400 mb-4">
          Salary Summary
        </h2>

        <table className="min-w-full text-sm mb-8">
          <thead>
            <tr className="bg-slate-700 text-orange-400">
              <th className="p-2 text-left">Year</th>
              <th className="p-2 text-right">Roster</th>
              <th className="p-2 text-right">Minors</th>
              <th className="p-2 text-right">Waiver</th>
              <th className="p-2 text-right">Cap Space</th>
            </tr>
          </thead>
          <tbody>
            {years.map(year => (
              <tr key={year} className="border-b border-slate-700">
                <td className="p-2 font-semibold">{year}</td>
                <td className="p-2 text-right">${salarySummary[year].roster}m</td>
                <td className="p-2 text-right">${salarySummary[year].minors}m</td>
                <td className="p-2 text-right text-yellow-400">
                  ${salarySummary[year].waiver}m
                </td>
                <td
                  className={`p-2 text-right ${
                    salarySummary[year].capSpace < 0
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  ${salarySummary[year].capSpace}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ================= PICKS TABLE (PRETTY) ================= */}
        <h2 className="text-lg font-semibold text-orange-400 mb-4">
          Draft Picks
        </h2>

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
                  <td className="p-2">
                    {renderPickLines(picksByYear[year]?.A)}
                  </td>
                  <td className="p-2">
                    {renderPickLines(picksByYear[year]?.B)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= PLAYER TABLES ================= */}
      {positionOrder
        .filter(pos => groupedPlayers[pos])
        .map(position => {
          const players = sortData(groupedPlayers[position])

          return (
            <div key={position} className="mb-8">
              <h2 className="text-xl font-semibold mb-3">{position}</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700 text-orange-400">
                      <th
                        onClick={() => handleSort("Player")}
                        className="p-2 cursor-pointer"
                      >
                        Player
                      </th>
                      <th
                        onClick={() => handleSort("Rookie / Minor / Captain")}
                        className="p-2 cursor-pointer"
                      >
                        Type
                      </th>
                      {years.map(y => (
                        <th
                          key={y}
                          onClick={() => handleSort(String(y))}
                          className="p-2 text-right cursor-pointer"
                        >
                          {y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, index) => (
                      <tr
                        key={index}
                        className="border-b border-slate-700 hover:bg-slate-800"
                      >
                        <td className="p-2 font-semibold">{player["Player"]}</td>
                        <td className="p-2 text-center">
                          {player["Rookie / Minor / Captain"] || "-"}
                        </td>
                        {years.map(y => (
                          <td key={y} className="p-2 text-right">
                            {player[String(y)] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
    </div>
  )
}