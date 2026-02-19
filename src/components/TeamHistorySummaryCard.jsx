// src/components/TeamHistorySummaryCard.jsx
import React from "react"

export default function TeamHistorySummaryCard({ summary }) {
  const awards = summary?.awards ? String(summary.awards) : "—"
  const bestR = summary?.bestRecordW || "—"
  const bestF = summary?.bestFptsAdjusted || "—"
  const bestP = summary?.bestPlayoffs || "—"

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-100">Team Records</div>
        <div className="text-[11px] text-slate-400">History</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800/70 bg-slate-950/20 p-3">
          <div className="text-[11px] font-semibold text-slate-300">Best Record</div>
          <div className="mt-1 text-lg font-bold text-slate-100">{bestR}</div>
        </div>

        <div className="rounded-xl border border-slate-800/70 bg-slate-950/20 p-3">
          <div className="text-[11px] font-semibold text-slate-300">Best Fpts/G Adj</div>
          <div className="mt-1 text-lg font-bold text-slate-100">{bestF}</div>
        </div>

        <div className="rounded-xl border border-slate-800/70 bg-slate-950/20 p-3">
          <div className="text-[11px] font-semibold text-slate-300">Best Playoffs</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{bestP}</div>
        </div>

        <div className="rounded-xl border border-slate-800/70 bg-slate-950/20 p-3">
          <div className="text-[11px] font-semibold text-slate-300">Awards</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{awards}</div>
        </div>
      </div>
    </div>
  )
}