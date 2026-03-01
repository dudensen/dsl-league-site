// utils/fetchOverview.js
export async function fetchOverviewMapping() {
  const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ"
  const OVERVIEW_GID = "285981266"

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${OVERVIEW_GID}`

  const res = await fetch(url)
  const text = await res.text()

  const jsonString = text.match(/google\.visualization\.Query\.setResponse\((.*)\);?/s)?.[1]
  if (!jsonString) throw new Error("Failed to parse Overview sheet response")

  const json = JSON.parse(jsonString)
  const rows = json.table.rows

  const mapping = {}

  rows.forEach(row => {
    const sheetCell = row.c[0]
    const teamCell = row.c[1]

    const gmCell = row.c[28]          // GM (col 28)
    const draftCell = row.c[29]       // ✅ Team Draft Code (col 29)

    if (!sheetCell || !teamCell) return

    const sheetName = sheetCell.v
    const teamName = teamCell.v

    const gmName = String(gmCell?.v ?? gmCell?.f ?? "").trim()
    const draftCode = String(draftCell?.v ?? draftCell?.f ?? "").trim()  // ✅ NEW

    let gid = null
    if (sheetCell.f) {
      const match = sheetCell.f.match(/gid=(\d+)/)
      if (match) gid = match[1]
    }

    if (sheetName && teamName) {
      mapping[teamName] = { sheetName, gid, gmName, draftCode } // ✅ NEW
    }
  })

  return mapping
}