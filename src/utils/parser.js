export function parsePlayers(rows) {
  if (!rows || rows.length < 3) {
    return { headers: [], data: [], displayMap: {} }
  }

  // 🔥 HEADERS ARE IN ROW 2
  const rawHeaders = rows[1].map(h =>
    h ? h.toString().trim() : ""
  )

  // 🔥 Make headers unique internally
  const headers = []
  const headerCount = {}

  rawHeaders.forEach(header => {
    if (!headerCount[header]) {
      headerCount[header] = 1
      headers.push(header)
    } else {
      headerCount[header]++
      headers.push(`${header}_${headerCount[header]}`)
    }
  })

  // 🔥 Build display labels with numeric-only rule
  const displayMap = {}

  headers.forEach(header => {
    const base = header.split("_")[0]

    const occurrences = rawHeaders.filter(
      h => h === base
    ).length

    const isPureNumber = /^\d+$/.test(base)

    if (isPureNumber && occurrences > 1) {
      // Only second occurrence gets "till"
      if (header.endsWith("_2")) {
        displayMap[header] = `salaries till ${base}`
      } else {
        displayMap[header] = base
      }
    } else {
      displayMap[header] = base
    }
  })

  // 🔥 Locate Player column
  const playerIndex = headers.findIndex(
    h => h.toLowerCase() === "player"
  )

  // 🔥 DATA STARTS FROM ROW 3
  const data = rows
    .slice(2)
    .map(row => {
      const obj = {}

      headers.forEach((header, index) => {
        obj[header] =
          row[index] !== undefined && row[index] !== null
            ? row[index].toString().trim()
            : ""
      })

      return obj
    })
    .filter(row => {
      if (playerIndex === -1) return true
      const player = row[headers[playerIndex]]
      return player && player.trim() !== ""
    })

  return { headers, data, displayMap }
}