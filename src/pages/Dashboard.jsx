import { NavLink } from "react-router-dom"

const tiles = [
  { to: "/players", label: "Players", desc: "Browse player list & details" },
  { to: "/teams", label: "Teams", desc: "All teams + rosters" },
  { to: "/history", label: "History", desc: "DSL League history" },
  { to: "/tradeanalyzer", label: "Trade Analyzer", desc: "Cap + FP impact tools" },
  { to: "/querybox", label: "Nolifer's Corner", desc: "Custom queries & experiments" },
]

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-orange-400">DSL League</h1>
        <p className="text-slate-300 mt-1">
          Choose a section to open.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            className="group rounded-2xl border border-slate-700 bg-slate-800/60 p-5 hover:border-orange-400 hover:bg-slate-800 transition"
          >
            <div className="text-xl font-semibold group-hover:text-orange-400 transition">
              {t.label}
            </div>
            <div className="text-sm text-slate-300 mt-1">
              {t.desc}
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  )
}