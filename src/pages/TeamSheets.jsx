import { useEffect, useState } from "react"
import { fetchTeamSheet } from "../utils/fetchTeamSheet"

export default function TeamSheets() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchTeamSheet("200889885")

        // Keep first 50 rows only
        setRows(data.slice(0, 80))
      } catch (err) {
        setError("Failed to load sheet")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return <div className="p-6 text-white">Loading...</div>
  }

  if (error) {
    return <div className="p-6 text-red-500">{error}</div>
  }

  if (!rows.length) {
    return <div className="p-6 text-white">No data found</div>
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-white">
      <h1 className="text-2xl font-bold text-orange-400 mb-6">
        Team Samarina Dudenbros (First 50 Rows)
      </h1>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-slate-700"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="p-2 whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}