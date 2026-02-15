import { useLeague } from "../context/LeagueContext"

export default function Home() {
  const { players, loading, error } = useLeague()

  if (loading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-500">{error}</div>

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">League Dashboard</h1>
      <p>Total Players: {players.length}</p>
    </div>
  )
}