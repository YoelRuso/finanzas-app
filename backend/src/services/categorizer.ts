// Categorizador de transacciones.
// Orden de prioridad:
//   1. Reglas propias del usuario (tabla CategoryRule)
//   2. Reglas por defecto (RULES)
//   3. 'otros'

import prisma from '../db/client'

export const CATEGORIES = [
  'alimentacion',
  'transporte',
  'suscripciones',
  'salud',
  'ocio',
  'vivienda',
  'compras',
  'deporte',
  'educacion',
  'ingresos',
  'transferencias',
  'otros',
] as const

export type Category = (typeof CATEGORIES)[number]

export function isValidCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

const RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['mercadona', 'lidl', 'aldi', 'carrefour', 'dia', 'eroski', 'consum', 'alcampo', 'supermercado', 'hipercor'], category: 'alimentacion' },
  { keywords: ['renfe', 'metro', 'bus', 'cabify', 'uber', 'blablacar', 'parking', 'gasolinera', 'repsol', 'bp', 'cepsa'], category: 'transporte' },
  { keywords: ['netflix', 'spotify', 'hbo', 'disney', 'amazon prime', 'youtube', 'apple', 'google'], category: 'suscripciones' },
  { keywords: ['farmacia', 'medico', 'clinica', 'hospital', 'salud', 'optica', 'dental'], category: 'salud' },
  { keywords: ['restaurante', 'bar', 'cafeteria', 'mcdonalds', 'burger king', 'telepizza', 'just eat', 'glovo', 'deliveroo'], category: 'ocio' },
  { keywords: ['luz', 'agua', 'gas natural', 'iberdrola', 'endesa', 'hipoteca', 'alquiler', 'comunidad'], category: 'vivienda' },
  { keywords: ['amazon', 'aliexpress', 'pccomponentes', 'fnac', 'mediamarkt', 'el corte ingles', 'zara', 'pull', 'mango', 'primark'], category: 'compras' },
  { keywords: ['gimnasio', 'fitness', 'sport', 'padel', 'tenis', 'futbol'], category: 'deporte' },
  { keywords: ['universidad', 'univ.', 'colegio', 'academia', 'matricula'], category: 'educacion' },
  { keywords: ['traspaso', 'transferencia', 'bizum'], category: 'transferencias' },
]

const WORD_CHAR = 'a-z0-9áéíóúüñ'

/**
 * Coincidencia por palabra completa: evita falsos positivos como
 * "zara" dentro de "C.ZARANDA" o "dia" dentro de "MEDIAMARKT".
 */
function matchesKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^${WORD_CHAR}])${escaped}([^${WORD_CHAR}]|$)`, 'i')
  return re.test(text)
}

/** Categoría según las reglas por defecto, sin tocar la base de datos. */
export function categorize(description: string): string {
  const lower = description.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => matchesKeyword(lower, kw))) {
      return rule.category
    }
  }
  return 'otros'
}

/** Categoría aplicando primero las reglas del usuario. */
export async function categorizeWithRules(description: string): Promise<string> {
  const lower = description.toLowerCase()
  const rules = await prisma.categoryRule.findMany()

  // La regla más específica (keyword más larga) gana.
  const match = rules
    .filter((r) => lower.includes(r.keyword.toLowerCase()))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0]

  if (match) return match.category

  return categorize(description)
}

// ── Extracción del nombre de comercio ──────────────────────────

// Prefijos que el banco añade al concepto ("Pago en MERCADONA ...").
const PREFIXES = [
  'pago en',
  'compra en',
  'compra',
  'pago tarjeta',
  'pago movil en',
  'pago',
  'recibo de',
  'recibo',
  'adeudo de',
  'adeudo',
  'transferencia de',
  'transferencia a',
]

// Ruido de localización al final del concepto ("... LAS PALMAS ES").
const LOCATION_NOISE = new Set([
  'es', 'esp', 'espana', 'españa', 'dees', 'spain',
  'las', 'palmas', 'gran', 'canaria', 'tenerife',
  'madrid', 'barcelona', 'valencia', 'sevilla', 'malaga', 'bilbao',
  'zaragoza', 'murcia', 'alicante', 'cordoba', 'valladolid', 'vigo',
  'gijon', 'granada', 'coruna', 'santander', 'pamplona', 'salamanca',
  'de', 'del', 'la', 'el',
])

const MAX_KEY_WORDS = 3

/**
 * Deriva un identificador de comercio a partir del concepto bancario.
 * "Pago en HD EL BATAN LAS PALMAS DEES" -> "hd el batan"
 * Se usa para agrupar movimientos parecidos y para sugerir la keyword
 * de una regla nueva.
 */
export function merchantKey(description: string): string {
  let text = description.toLowerCase().trim()

  for (const prefix of PREFIXES) {
    if (text.startsWith(`${prefix} `)) {
      text = text.slice(prefix.length).trim()
      break
    }
  }

  let words = text.split(/\s+/).filter(Boolean)

  // Quita el ruido de localización solo por la cola, nunca todo.
  while (words.length > 1 && LOCATION_NOISE.has(stripPunctuation(words[words.length - 1]))) {
    words = words.slice(0, -1)
  }

  words = words.slice(0, MAX_KEY_WORDS)

  return words.join(' ').trim() || description.toLowerCase().trim()
}

function stripPunctuation(word: string): string {
  return word.replace(/[.,;:()/-]/g, '')
}
