import { useEffect, useState } from "react"
import { fetchSheetMeta } from "../utils/fetchSheetMeta"

export default function TeamSheetIndex() {
  const [sheets, setSheets] = useState([])

  useEffect(() => {
    async function load() {
      const data = await fetchSheetMeta()
      setSheets(data)
    }

    load()
  }, [])

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl text-orange-400 mb-4">
        Team Sheets
      </h1>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-700 text-orange-400">
            <th className="p-2 text-left">Sheet Name</th>
            <th className="p-2 text-left">GID</th>
          </tr>
        </thead>
        <tbody>
          {sheets.map(sheet => (
            <tr key={sheet.gid} className="border-b border-slate-700">
              <td className="p-2">{sheet.title}</td>
              <td className="p-2">{sheet.gid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}