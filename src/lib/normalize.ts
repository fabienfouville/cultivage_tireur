/** Normalise une réponse libre pour la comparer : minuscules, sans accents, sans articles ni ponctuation */
export function normalize(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(le|la|les|l|un|une|des|du|de|d|the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * La réponse ressemble-t-elle à la réponse attendue ? Sert seulement à pré-cocher la validation :
 * l'animateur garde toujours le dernier mot.
 * `expected` peut contenir plusieurs variantes séparées par « / » ou « ; ».
 */
export function looksRight(answer: unknown, expected: unknown): boolean {
  const a = normalize(answer)
  if (!a) return false
  const variants = String(expected ?? '')
    .split(/[/;|]| ou /)
    .map(normalize)
    .filter(Boolean)
  return variants.some((e) => {
    if (a === e) return true
    if (e.length >= 4 && (a.includes(e) || (a.length >= 4 && e.includes(a) && a.length >= e.length * 0.5))) return true
    const tolerance = e.length <= 4 ? 0 : e.length <= 8 ? 1 : 2
    return levenshtein(a, e) <= tolerance
  })
}
