import { createContext, useContext, useEffect, useState } from "react"
import { fetchSheet } from "../utils/fetchSheets"
import { parsePlayers } from "../utils/parser"

const LeagueContext = createContext(null)

export function LeagueProvider({ children }) {
  const [table, setTable] = useState({
    headers: [],
    data: [],
    displayMap: {}
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadPlayers() {
      try {
        const rows = await fetchSheet()
        const parsed = parsePlayers(rows)
        setTable(parsed)
      } catch (err) {
        console.error("League load error:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadPlayers()
  }, [])

  return (
    <LeagueContext.Provider value={{ table, loading, error }}>
      {children}
    </LeagueContext.Provider>
  )
}

export function useLeague() {
  const context = useContext(LeagueContext)
  if (!context) {
    throw new Error("useLeague must be used inside LeagueProvider")
  }
  return context
}