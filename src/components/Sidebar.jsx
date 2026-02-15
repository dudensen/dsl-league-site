import { NavLink } from "react-router-dom"

export default function Sidebar() {
  const baseClass = "transition"
  const inactiveClass = "text-slate-300 hover:text-orange-400"
  const activeClass = "text-orange-400 font-semibold"

  return (
    <aside className="hidden md:flex w-60 shrink-0 h-screen overflow-y-auto bg-slate-800 p-6 flex-col">
      <h2 className="text-2xl font-bold mb-8 text-orange-400">DSL League</h2>

      <nav className="flex flex-col gap-4">
        <NavLink to="/" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Dashboard</NavLink>
        <NavLink to="/teams" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Teams</NavLink>
        <NavLink to="/players" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Players</NavLink>
        <NavLink to="/playerdata" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>PlayerData</NavLink>
        <NavLink to="/tradeanalyzer" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Trade Analyzer</NavLink>
        <NavLink to="/querybox" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>Nolifer's Corner</NavLink>
      </nav>
    </aside>
  )
}