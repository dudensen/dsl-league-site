export async function fetchSheet() {
  const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ"
  const GID = "284322669" // Players Master List tab

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Failed to fetch sheet CSV")
  }

  const csvText = await response.text()

  return parseCSV(csvText)
}

function parseCSV(text) {
  const rows = []
  let current = []
  let value = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        value += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      current.push(value)
      value = ""
    } else if (char === "\n" && !inQuotes) {
      current.push(value)
      rows.push(current)
      current = []
      value = ""
    } else {
      value += char
    }
  }

  if (value.length > 0) {
    current.push(value)
    rows.push(current)
  }

  return rows
}