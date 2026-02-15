const SHEET_ID = "146QdGaaB1Nt0HJXG_s8O0s5N0lQDfnWGmGsgNHEnCkQ"

export async function fetchTeamSheet(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`

  const res = await fetch(url)

  if (!res.ok) {
    throw new Error("Failed to fetch sheet")
  }

  const text = await res.text()

  return text
    .split("\n")
    .map(row => row.split(","))
}