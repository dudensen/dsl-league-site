export async function fetchSheetMeta() {
  const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ"
  const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`

  const res = await fetch(url)
  const json = await res.json()

  if (!json.sheets) {
    throw new Error("Failed to fetch sheet metadata")
  }

  return json.sheets.map(sheet => ({
    title: sheet.properties.title,
    gid: sheet.properties.sheetId
  }))
}