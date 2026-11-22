// Pure PII redaction, run on conversation text before it reaches the AI endpoint (Requirement 12.6).

// Applied top to bottom: phone runs before order and postcode so digits get one label.
// Phone rules skip digits that continue a longer number or a PB order code.
const RULES: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ['[EMAIL]', /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g],
  // Malaysia: +60 / 60 / 0, then a 1x mobile prefix or a landline area code
  ['[PHONE]', /(?<![\d+]|\bPB-?)(?:\+60[\s-]?|60[\s-]?|0)(?:1\d|[3-9])[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/gi],
  // Singapore: 8 digits starting 6, 8 or 9, with or without +65
  ['[PHONE]', /(?<![\d+]|\bPB-?)(?:\+?65[\s-]?)?[689]\d{3}[\s-]?\d{4}(?!\d)/gi],
  // shortcut: order format guessed without real data, confirm against exports before relying on it
  ['[ORDER]', /\bPB-?\d{5,}\b/gi],
  ['[ORDER]', /(?<=\border\s*(?:no\.?|number|id)?\s*[:#]?\s*)(?=[a-z-]*\d)[a-z0-9-]{5,}/gi],
  // "No. 12, Jalan Tun Razak", "12 jln SS 2/24": first street word in any case, then up to two capitalised or numeric words
  ['[ADDRESS]', /\b(?:[Nn]o\.?\s*)?\d+[A-Za-z]?(?:-\d+)*,?\s+(?:[Jj]alan|[Jj]ln\.?|[Ll]orong|[Pp]ersiaran)\s+[\w/-]+(?:\s+[A-Z0-9][\w/-]*){0,2}/g],
  // "Blk 123 Bedok North Street 1", "8 Orchard Road"
  ['[ADDRESS]', /\b(?:Blk\s+)?\d+[A-Z]?\s+(?:[A-Z][a-z]*\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Drive)\b(?:\s+\d+\b)?/g],
  ['[ADDRESS]', /#\d{1,3}-\d{1,5}(?!\d)/g],
  // Malaysian postcode followed by a place name, "50450 Kuala Lumpur"
  ['[ADDRESS]', /\b\d{5}(?=,?\s+[A-Z][a-z])/g],
  ['[ADDRESS]', /(?<=\bSingapore,?\s*)\d{6}(?!\d)/gi],
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// `names` holds the conversation's customer_name value(s); the full name and each part of 3+ chars become [NAME].
export function redact(text: string, names: readonly string[] = []): string {
  const out = RULES.reduce((acc, [label, re]) => acc.replace(re, label), text)
  const terms = [...new Set(names.flatMap((n) => [n.trim(), ...n.trim().split(/\s+/).filter((p) => p.length >= 3)]))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  if (terms.length === 0) return out
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.map(escape).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  return out.replace(re, '[NAME]')
}
