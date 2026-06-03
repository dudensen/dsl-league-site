// scripts/testOverviewTeams.mjs
import { fetchOverviewMapping } from "../src/utils/fetchOverview.js"

function normTeam(x) {
  return String(x ?? "")
    .replace(/\r/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[’'“”"]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/[\/∕]/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

const TARGETS = ["Black Mambo No.5", "Samarina Dudenbros"]

const map = await fetchOverviewMapping()

console.log("keys:", Object.keys(map).length)
console.log("sample keys:", Object.keys(map).slice(0, 10))

for (const t of TARGETS) {
  console.log("\n==============================")
  console.log("TARGET:", t)
  console.log("DIRECT:", map[t])

  // normalized lookup (handles dots/spaces/dashes/quotes etc)
  const byNorm = new Map(Object.entries(map).map(([k, v]) => [normTeam(k), { key: k, ...v }]))
  const hit = byNorm.get(normTeam(t))
  console.log("NORM HIT:", hit)

  // quick “contains” suggestions if still not found
  if (!hit) {
    const needle = normTeam(t)
    const suggestions = Object.keys(map)
      .filter(k => normTeam(k).includes(needle.slice(0, 8)) || needle.includes(normTeam(k).slice(0, 8)))
      .slice(0, 20)
    console.log("SUGGESTIONS:", suggestions)
  }
}