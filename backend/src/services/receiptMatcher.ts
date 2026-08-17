// Emparejado de un ticket con el movimiento bancario que lo pagó, y reglas
// propias producto → subcategoría.
//
// Un ticket vinculado no suma gasto por su cuenta: solo desglosa el
// movimiento que ya estaba contado. Un ticket sin vincular (efectivo) sí es
// gasto propio, porque el banco no lo trae.

import prisma from '../db/client'
import { merchantKey } from './categorizer'
import { isValidSubcategory } from './subcategories'

/** Margen para dar por bueno que dos importes son el mismo. */
const AMOUNT_TOLERANCE = 0.02

/** Días arriba y abajo en los que se busca el movimiento. */
const DATE_WINDOW_DAYS = 4

export interface Candidate {
  id: number
  date: Date
  description: string
  amount: number
  category: string | null
  /** Cuánto se parece: mayor es mejor. */
  score: number
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/** Palabras significativas de un texto, para comparar comercios. */
function tokens(text: string): Set<string> {
  return new Set(
    merchantKey(text)
      .split(/\s+/)
      .filter((word) => word.length >= 4)
  )
}

/**
 * Movimientos que podrían corresponder a este ticket: mismo importe (con
 * margen), fecha cercana y todavía sin ticket asociado.
 * Vienen ordenados de más a menos probable.
 */
export async function findCandidates(
  total: number,
  date: Date,
  merchant: string,
  options: { excludeReceiptId?: number } = {}
): Promise<Candidate[]> {
  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: addDays(date, -DATE_WINDOW_DAYS), lte: addDays(date, DATE_WINDOW_DAYS) },
      amount: { lt: 0 },
      // Un traspaso a otra cuenta propia nunca es la compra de un ticket.
      isTransfer: false,
      OR: [
        { receipt: { is: null } },
        ...(options.excludeReceiptId
          ? [{ receipt: { is: { id: options.excludeReceiptId } } }]
          : []),
      ],
    },
    select: { id: true, date: true, description: true, amount: true, category: true },
  })

  const merchantTokens = tokens(merchant)

  return transactions
    .filter((tx) => Math.abs(Math.abs(tx.amount) - total) <= AMOUNT_TOLERANCE)
    .map((tx) => {
      const shared = [...tokens(tx.description)].filter((word) => merchantTokens.has(word))
      const daysApart = Math.abs(tx.date.getTime() - date.getTime()) / 86_400_000
      // El comercio pesa más que la fecha: el importe exacto ya filtra mucho.
      const score = shared.length * 10 - daysApart
      return { ...tx, score }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Elige automáticamente solo cuando no hay ambigüedad: un único candidato,
 * o uno que coincide en nombre de comercio y ningún otro lo hace.
 * Si hay duda, devuelve null y decide el usuario.
 */
export function pickAutoMatch(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const [best, second] = candidates
  // score >= 10 significa al menos una palabra de comercio en común.
  if (best.score >= 10 && second.score < 10) return best
  return null
}

// ── Reglas propias producto → subcategoría ────────────────────

/**
 * Aplica las reglas del usuario al nombre de un producto.
 * Gana la regla más específica (keyword más larga).
 */
export async function applyProductRules(name: string): Promise<string | null> {
  const lower = name.toLowerCase()
  const rules = await prisma.productRule.findMany()

  const match = rules
    .filter((rule) => lower.includes(rule.keyword.toLowerCase()))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0]

  return match && isValidSubcategory(match.subcategory) ? match.subcategory : null
}

/**
 * Guarda la corrección del usuario como regla y la propaga al resto de
 * líneas que aún no haya tocado a mano. Devuelve cuántas ha cambiado.
 */
export async function saveProductRule(keyword: string, subcategory: string): Promise<number> {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return 0

  await prisma.productRule.upsert({
    where: { keyword: kw },
    update: { subcategory },
    create: { keyword: kw, subcategory },
  })

  // SQLite no soporta `mode: 'insensitive'` en Prisma, así que se filtra
  // en memoria — el mismo apaño que usan las reglas de categoría.
  const items = await prisma.receiptItem.findMany({
    where: { manual: false },
    select: { id: true, name: true, subcategory: true },
  })

  const ids = items
    .filter((item) => item.name.toLowerCase().includes(kw) && item.subcategory !== subcategory)
    .map((item) => item.id)

  if (ids.length === 0) return 0

  const result = await prisma.receiptItem.updateMany({
    where: { id: { in: ids } },
    data: { subcategory },
  })

  return result.count
}
