// src/pages/Constitution.jsx
import React, { useEffect, useMemo, useState } from "react"

const DOC_ID = "1wQs6y7WksHQ1C3qIW7ppXjcmBQ3T73p2"
const EXPORT_HTML_URL = `https://docs.google.com/document/d/${DOC_ID}/export?format=html`
const OPEN_DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`

// Canonical section headings (exact text match after whitespace normalization)
const SECTION_TITLES = [
  "Εισαγωγή",
  "Δομή",
  "Rosters",
  "Season-End Date",
  "Salaries & Contracts Extensions / Contract Waivers & Buy-Outs",
  "Το ετήσιο Rookie Draft – Rookie Contracts",
  "Free Agency & Restricted Free Agency",
  "Υπέρβαση Salary Cap – Luxury Penalty (Ισχύει μόνο για την In-season περίοδο)",
  "In-season Injury Exception",
  "Trades",
  "Αλλαγές στους Κανόνες"
]

const DOC_MAIN_TITLE = "Dynasty Summer League (DSL) - Καταστατικό"
const DOC_YEAR_TITLE = "2020-2025"

/* ----------------------------- utils ----------------------------- */

function normText(x) {
  return String(x ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function pickAllowedInlineStyle(styleValue) {
  if (!styleValue) return ""

  const allowed = new Map()
  const parts = String(styleValue)
    .split(";")
    .map(s => s.trim())
    .filter(Boolean)

  for (const part of parts) {
    const idx = part.indexOf(":")
    if (idx === -1) continue
    const prop = part.slice(0, idx).trim().toLowerCase()
    const val = part.slice(idx + 1).trim()

    // safe styles to preserve formatting
    if (prop === "color") allowed.set("color", val)
    if (prop === "background-color") allowed.set("background-color", val)
    if (prop === "font-weight") allowed.set("font-weight", val)
    if (prop === "font-style") allowed.set("font-style", val)

    // Google Docs sometimes renders underline as border-bottom
    if (prop === "border-bottom") allowed.set("border-bottom", val)

    // underline / strikethrough
    if (prop === "text-decoration" || prop === "text-decoration-line") {
      const safe = val
        .toLowerCase()
        .split(/\s+/)
        .filter(v => ["underline", "line-through", "none"].includes(v))
        .join(" ")
      if (safe) allowed.set("text-decoration", safe)
    }
  }

  return Array.from(allowed.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ")
}

function mergeConsecutiveLists(root) {
  const kids = Array.from(root.childNodes || [])
  for (let i = 0; i < kids.length - 1; i++) {
    const a = kids[i]
    const b = kids[i + 1]
    if (!a?.tagName || !b?.tagName) continue

    const ta = a.tagName.toLowerCase()
    const tb = b.tagName.toLowerCase()
    if (ta !== tb) continue
    if (ta !== "ol" && ta !== "ul") continue

    // If the second list explicitly requests a start, assume numbering restart and don't merge.
    if (tb === "ol") {
      const bStart = b.getAttribute("start")
      if (bStart && String(bStart).trim() !== "") continue
    }

    const items = Array.from(b.children || []).filter(
      el => el.tagName && el.tagName.toLowerCase() === "li"
    )
    items.forEach(li => a.appendChild(li))
    b.remove()
    i = Math.max(-1, i - 1)
  }
}

function promoteKnownSections(docBody) {
  const titleSet = new Set(SECTION_TITLES.map(normText))

  // We only promote blocks that are basically a "single line" title:
  // - <p>, <div> (and sometimes <li>) whose normalized text exactly matches one of the section titles.
  const blocks = Array.from(docBody.querySelectorAll("p,div,li"))

  for (const el of blocks) {
    const t = normText(el.textContent)
    if (!t) continue

    // Promote year title to H1 inside the content
    if (t === DOC_YEAR_TITLE) {
      const h1 = docBody.ownerDocument.createElement("h1")
      h1.textContent = DOC_YEAR_TITLE
      el.replaceWith(h1)
      continue
    }

    // Promote known section titles to H2
    if (titleSet.has(t)) {
      const h2 = docBody.ownerDocument.createElement("h2")
      h2.textContent = t
      el.replaceWith(h2)
      continue
    }

    // Promote main title inside doc to H2 as well (we'll also use it as page header)
    if (t === DOC_MAIN_TITLE) {
      const h2 = docBody.ownerDocument.createElement("h2")
      h2.textContent = t
      el.replaceWith(h2)
      continue
    }
  }
}

function extractDocHeaderAndStrip(html) {
  // Returns { headerTitle, htmlWithoutHeader }
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html")
  const root = doc.body.firstElementChild

  // Prefer the DSL main title if present
  let chosen = Array.from(root.querySelectorAll("h1,h2,h3,p,div"))
    .find(el => normText(el.textContent) === DOC_MAIN_TITLE) || null

  if (!chosen) {
    // fallback: first meaningful heading or paragraph
    chosen = Array.from(root.querySelectorAll("h1,h2,h3,p,div")).find(
      el => normText(el.textContent).length > 0
    ) || null
  }

  const headerTitle = chosen ? normText(chosen.textContent) : "Constitution"

  // Remove from body to avoid duplicate display
  if (chosen) chosen.remove()

  return { headerTitle, htmlWithoutHeader: root.innerHTML }
}

function sanitizeGoogleDocHtml(rawHtml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, "text/html")

  // Remove junk
  const killSelectors = ["script", "style", "link", "meta", "iframe", "object", "embed", "noscript"]
  killSelectors.forEach(sel => doc.querySelectorAll(sel).forEach(n => n.remove()))

  const body = doc.body

  // Merge list fragments early (helps numbered lists not restart at 1)
  mergeConsecutiveLists(body)
  body.querySelectorAll("*").forEach(node => {
    if (node?.childNodes?.length) mergeConsecutiveLists(node)
  })

  // Allowlist attributes (keep list numbering + minimal styling)
  const allowedAttrsByTag = {
    a: new Set(["href", "target", "rel", "style"]),
    img: new Set(["src", "alt", "loading", "style"]),
    ol: new Set(["start", "style"]),
    li: new Set(["value", "style"]),
    span: new Set(["style"]),
    p: new Set(["style"]),
    div: new Set(["style"]),
    u: new Set(["style"]),
    b: new Set(["style"]),
    strong: new Set(["style"]),
    em: new Set(["style"]),
    del: new Set(["style"]),
    s: new Set(["style"])
  }

  // Walk and clean
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)

  for (const el of nodes) {
    const tag = el.tagName?.toLowerCase()
    if (!tag) continue

    // Safe link behavior
    if (tag === "a") {
      el.setAttribute("target", "_blank")
      el.setAttribute("rel", "noreferrer")
    }

    // Safe images
    if (tag === "img") {
      el.setAttribute("loading", "lazy")
    }

    // Clean styles but retain safe subset
    if (el.hasAttribute("style")) {
      const cleaned = pickAllowedInlineStyle(el.getAttribute("style"))
      if (cleaned) el.setAttribute("style", cleaned)
      else el.removeAttribute("style")
    }

    // Strip attributes except allowlist
    const attrs = Array.from(el.attributes || [])
    const keep = allowedAttrsByTag[tag] || new Set()
    for (const a of attrs) {
      const name = a.name.toLowerCase()
      if (name.startsWith("on")) {
        el.removeAttribute(a.name)
        continue
      }
      if (!keep.has(name)) el.removeAttribute(a.name)
    }
  }

  // Promote titles/sections by exact text matching (reliable for your doc)
  promoteKnownSections(body)

  // Merge lists again after transformations
  mergeConsecutiveLists(body)

  return body.innerHTML
}

/* ----------------------------- page ----------------------------- */

export default function Constitution() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [contentHtml, setContentHtml] = useState("")
  const [pageTitle, setPageTitle] = useState("Constitution")

  useEffect(() => {
    const ac = new AbortController()

    async function load() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(EXPORT_HTML_URL, { signal: ac.signal, cache: "no-store" })
        if (!res.ok) throw new Error(`Failed to fetch doc HTML (${res.status})`)

        const raw = await res.text()
        const cleaned = sanitizeGoogleDocHtml(raw)

        const { headerTitle, htmlWithoutHeader } = extractDocHeaderAndStrip(cleaned)
        setPageTitle(headerTitle || "Constitution")
        setContentHtml(htmlWithoutHeader)
      } catch (e) {
        if (e.name === "AbortError") return
        setError(
          "Could not load the Constitution. Make sure the Google Doc is shared as “Anyone with the link can view” (or published to the web)."
        )
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => ac.abort()
  }, [])

  const content = useMemo(() => contentHtml, [contentHtml])

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h1 className="text-2xl md:text-3xl font-bold text-orange-400">{pageTitle}</h1>

        <a
          href={OPEN_DOC_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-slate-300 hover:text-orange-300 transition"
        >
          Open in Google Docs
        </a>
      </div>

      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden shadow">
        <div className="p-4 md:p-6">
          {loading && <div className="text-slate-300 animate-pulse">Loading…</div>}

          {!loading && error && (
            <div className="text-rose-300">
              {error}
              <div className="mt-2">
                <a
                  href={OPEN_DOC_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-300 hover:text-orange-200 underline"
                >
                  Open the doc to check sharing
                </a>
              </div>
            </div>
          )}

          {!loading && !error && (
            <article
              className="
                text-slate-200 leading-relaxed
                [&_h1]:text-3xl [&_h1]:md:text-4xl [&_h1]:font-extrabold [&_h1]:text-slate-50 [&_h1]:mt-2 [&_h1]:mb-4
                [&_h2]:text-xl [&_h2]:md:text-2xl [&_h2]:font-bold [&_h2]:text-orange-400 [&_h2]:mt-8 [&_h2]:mb-3
                [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-100 [&_h3]:mt-6 [&_h3]:mb-2
                [&_p]:my-3
                [&_strong]:text-slate-50 [&_b]:text-slate-50
                [&_u]:decoration-orange-400 [&_u]:decoration-2
                [&_a]:text-orange-300 hover:[&_a]:text-orange-200 [&_a]:underline
                [&_ul]:my-3 [&_ul]:ml-6 [&_ul]:list-disc
                [&_ol]:my-3 [&_ol]:ml-6 [&_ol]:list-decimal
                [&_li]:my-1
                [&_hr]:my-6 [&_hr]:border-slate-700
                [&_table]:w-full [&_table]:my-4 [&_table]:border-collapse
                [&_th]:border [&_th]:border-slate-700 [&_th]:bg-slate-900/40 [&_th]:p-2 [&_th]:text-left
                [&_td]:border [&_td]:border-slate-700 [&_td]:p-2
                [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:my-3
                [&_s]:opacity-90 [&_del]:opacity-90
              "
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>
      </div>
    </div>
  )
}