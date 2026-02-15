export async function fetchOverviewMapping() {
  const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ"
  const OVERVIEW_GID = "285981266"

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${OVERVIEW_GID}`

  const res = await fetch(url)
  const text = await res.text()

  // Remove wrapper safely
  const jsonString = text.match(/google\.visualization\.Query\.setResponse\((.*)\);?/s)?.[1]

  if (!jsonString) {
    throw new Error("Failed to parse Overview sheet response")
  }

  const json = JSON.parse(jsonString)

  const rows = json.table.rows
  const mapping = {}

  rows.forEach(row => {
    const sheetCell = row.c[0]
    const teamCell = row.c[1]

    if (!sheetCell || !teamCell) return

    const sheetName = sheetCell.v
    const teamName = teamCell.v

    let gid = null

    // Extract gid from formatted hyperlink
    if (sheetCell.f) {
      const match = sheetCell.f.match(/gid=(\d+)/)
      if (match) gid = match[1]
    }

    if (sheetName && teamName && gid) {
      mapping[teamName] = {
        sheetName,
        gid
      }
    }
  })

  return mapping
}