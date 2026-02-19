import { NavLink } from "react-router-dom"

export default function Sidebar() {
  const baseClass = "transition"
  const inactiveClass = "text-slate-300 hover:text-orange-400"
  const activeClass = "text-orange-400 font-semibold"

  return (
    <aside className="hidden md:flex w-60 shrink-0 h-screen overflow-y-auto bg-slate-800 p-6 flex-col">
      {/* Logo (top, centered) */}
      <img
        src="/logos/_default-logo.png"
        alt="DSL League"
        className="h-40 rounded-xl object-contain mb-4 self-start"
        loading="lazy"
        onError={e => {
          e.currentTarget.style.display = "none"
        }}
      />

      {/* Title (left, right above nav) */}
      <h2 className="text-2xl font-bold mb-8 text-orange-400">
        DSL League
      </h2>

      <nav className="flex flex-col gap-4">
        <NavLink to="/" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Dashboard</NavLink>
        <NavLink to="/teams" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Teams</NavLink>
        <NavLink to="/players" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Players</NavLink>
        <NavLink to="/playerdata" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>PlayerData</NavLink>
        <NavLink to="/tradeanalyzer" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Trade Analyzer</NavLink>
        <NavLink to="/querybox" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Nolifer's Corner</NavLink>
        <NavLink to="/history" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>League History</NavLink>
      </nav>
    </aside>
  )
}