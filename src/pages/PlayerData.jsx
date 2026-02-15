import { useLeague } from "../context/LeagueContext"

export default function PlayerData() {
  const { table, loading, error } = useLeague()

  if (loading) {
    return <div className="p-6 text-white">Loading...</div>
  }

  if (error) {
    return <div className="p-6 text-red-500">{error}</div>
  }

  const { headers = [], data = [], displayMap = {} } = table

  if (!headers.length) {
    return (
      <div className="p-6 text-white">
        No headers found.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-white overflow-x-auto">
      <h1 className="text-2xl font-bold mb-6">
        Player Data (Raw)
      </h1>
      <div className="mt-2 text-xs text-slate-400">
      Tip: Shift + mouse wheel scrolls horizontally.
    </div>

      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-700 text-orange-400">
            {headers.map(header => (
              <th
                key={header}
                className="p-2 text-left"
              >
                {displayMap?.[header] || header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-slate-700 hover:bg-slate-800"
            >
              {headers.map(header => (
                <td
                  key={header}
                  className="p-2 whitespace-nowrap"
                >
                  {row[header]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    
    </div>
    
  )
}