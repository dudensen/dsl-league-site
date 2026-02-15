import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts"

// Expects: data = [{ year: 2020, rank: 53 }, ...]
// Smaller rank is better, so we invert the Y axis by using reversed={true}
export default function PlayerRankTrend({ data }) {
  if (!data || data.length === 0) return null

  const ranks = data.map(d => d.rank).filter(r => Number.isFinite(r))
  const maxRank = ranks.length ? Math.max(...ranks) : 200

  return (
    <div className="bg-slate-800 p-4 rounded mb-6">
      <h2 className="text-lg font-semibold text-orange-400 mb-3">
        Rank Trend
      </h2>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis
              domain={[1, maxRank]}
              reversed={true}
              allowDecimals={false}
            />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="rank"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-slate-400 mt-2">
        Lower rank is better (Rank 1 at the top).
      </p>
    </div>
  )
}