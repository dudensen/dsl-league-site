import { BrowserRouter, Routes, Route } from "react-router-dom"
import { LeagueProvider } from "./context/LeagueContext"

import Sidebar from "./components/Sidebar"
import Players from "./pages/Players"
import PlayerData from "./pages/PlayerData"
import Teams from "./pages/Teams"
import TeamDetail from "./pages/TeamDetail"
import TeamSheets from "./pages/TeamSheets"
import PlayerDetail from "./pages/PlayerDetail"
import TradeAnalyzerPage from "./pages/TradeAnalyzer"
import QueryBox from "./pages/QueryBox"
import Dashboard from "./pages/Dashboard"
import Constitution from "./pages/Constitution"
import History from "./pages/History";

import PlayerOptions from "./pages/PlayerOptions"

export default function App() {
  return (
    <BrowserRouter>
      <LeagueProvider>
        {/* IMPORTANT: body stops scrolling */}
        <div className="flex h-screen overflow-hidden bg-slate-900">
          <Sidebar />

          {/* IMPORTANT: ONLY main content scrolls (down + right) */}
          <div className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/players" element={<Players />} />
              <Route path="/playerdata" element={<PlayerData />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/player/:playerName" element={<PlayerDetail />} />
              <Route path="/tradeanalyzer" element={<TradeAnalyzerPage />} />
              <Route path="/querybox" element={<QueryBox />} />
              <Route path="/teamsheets" element={<TeamSheets />} />
              <Route path="/teams/:teamName" element={<TeamDetail />} />
              <Route path="/history" element={<History />} />
              <Route path="/constitution" element={<Constitution />} />
              <Route path="/PlayerOptions" element={<PlayerOptions />} />
            </Routes>
          </div>
        </div>
      </LeagueProvider>
    </BrowserRouter>
  )
}