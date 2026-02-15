import { useLeague } from "../context/LeagueContext"
import { Link } from "react-router-dom"


export default function Teams() {
  const { table, loading, error } = useLeague()

  if (loading) return <div className="p-6 text-white">Loading...</div>
  if (error) return <div className="p-6 text-red-500">{error}</div>

  const { data = [] } = table

  const teams = [
    ...new Set(data.map(row => row["Current Owner"]).filter(Boolean))
  ].sort()

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-white">
      <h1 className="text-3xl font-bold mb-8">Teams</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map(team => (
          <Link
            key={team}
            to={`/teams/${encodeURIComponent(team)}`}
            className="bg-slate-700 p-4 rounded hover:bg-slate-600"
          >
            <div className="text-lg font-semibold text-orange-400">
              {team}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}