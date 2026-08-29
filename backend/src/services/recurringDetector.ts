// Detección de gastos fijos a partir del histórico.
//
// La lista de gastos fijos se escribía a mano teniendo la respuesta ya en la
// base de datos: un recibo que llega todos los meses, por el mismo importe y
// del mismo comercio, es exactamente eso. Esto lo busca y lo propone; crear
// el gasto sigue siendo una confirmación del usuario, igual que en las reglas
// de categoría. El detector nunca escribe nada.

import prisma from '../db/client'
import { merchantKey } from './categorizer'

/** Cuánto histórico se mira. Seis meses y pico dan hasta 7 cargos mensuales. */
const LOOKBACK_DAYS = 200

/**
 * Cargos mínimos para hablar de serie. Con dos es imposible distinguir una
 * suscripción de dos compras que cayeron con un mes de diferencia.
 */
const MIN_CHARGES = 3

/**
 * Cadencia admitida entre cargos consecutivos. Los meses tienen entre 28 y 31
 * días y el banco mueve el cargo cuando cae en fin de semana o festivo, así
 * que el intervalo real de algo «mensual» oscila bastante.
 */
const MIN_GAP_DAYS = 24
const MAX_GAP_DAYS = 38

/**
 * Sin cargo reciente la serie está muerta: una suscripción dada de baja hace
 * tres meses no es un gasto fijo de hoy. Se dan casi dos ciclos de margen
 * para no esconder la propuesta justo antes de que llegue el cargo del mes.
 */
const STALE_DAYS = 50

/**
 * Cuánto puede moverse el importe respecto a la mediana. Una suscripción es
 * clavada, pero la luz o el móvil varían y siguen siendo gastos fijos.
 */
const AMOUNT_TOLERANCE = 0.25

/** Suelo absoluto: en importes pequeños un 25% son céntimos sin significado. */
const MIN_AMOUNT_MARGIN = 1.5

/** Por debajo de esta desviación el importe se considera clavado. */
const TIGHT_TOLERANCE = 0.02

/** Un cargo de céntimos no merece un hueco en la lista de gastos fijos. */
const MIN_AMOUNT = 3

const DAY_MS = 24 * 60 * 60 * 1000

export interface RecurringSuggestion {
  /** Clave de comercio: la misma con la que agrupa el clasificador. */
  key: string
  /** Nombre propuesto para el gasto fijo, ya presentable. */
  name: string
  /** Concepto bancario completo del último cargo, para reconocerlo. */
  sample: string
  /** Importe propuesto: la mediana de la serie. */
  amount: number
  /** El menor y el mayor de la serie. Iguales cuando el cargo es clavado. */
  minAmount: number
  maxAmount: number
  /** Categoría dominante entre los movimientos de la serie. */
  category: string
  /** Cargos que forman la serie. */
  count: number
  /** Días entre cargos (mediana), redondeado. */
  everyDays: number
  /** Fechas del primer y del último cargo, en ISO. */
  firstDate: string
  lastDate: string
  /** 'alta' cuando el importe es clavado; 'media' cuando varía. */
  confidence: 'alta' | 'media'
}

interface Charge {
  date: Date
  amount: number
  description: string
  category: string | null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Palabras que dentro de un nombre van en minúscula salvo al principio. */
const LOWER_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a'])

/**
 * Convierte la clave de comercio en algo legible en una lista:
 * "netflix" -> "Netflix", "seguros el corte" -> "Seguros el Corte".
 * Es solo una propuesta: el nombre se puede editar una vez creado.
 */
export function prettyName(key: string): string {
  return key
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      if (i > 0 && LOWER_WORDS.has(word)) return word
      // Las siglas cortas se dejan enteras en mayúscula ("hd" -> "HD").
      if (word.length <= 2) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/** La categoría que más se repite en la serie. Empate: la primera contada. */
function dominantCategory(charges: Charge[]): string {
  const counts = new Map<string, number>()
  for (const charge of charges) {
    const category = charge.category ?? 'otros'
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  let best = 'otros'
  let bestCount = 0
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category
      bestCount = count
    }
  }
  return best
}

/**
 * Decide si una serie de cargos del mismo comercio es un gasto fijo mensual.
 *
 * Se exige que **todos** los huecos entren en la cadencia, no la media: un
 * supermercado tiene cargos cada pocos días y se cae aquí solo, mientras que
 * con la media colaría cualquier comercio al que vayas de vez en cuando. El
 * precio de esa exigencia es perder las series con un mes saltado, que es
 * justo el fallo que interesa tener (no proponer de más).
 */
function analyzeSeries(key: string, charges: Charge[], now: Date): RecurringSuggestion | null {
  if (charges.length < MIN_CHARGES) return null

  const sorted = [...charges].sort((a, b) => a.date.getTime() - b.date.getTime())

  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / DAY_MS
    if (gap < MIN_GAP_DAYS || gap > MAX_GAP_DAYS) return null
    gaps.push(gap)
  }

  const last = sorted[sorted.length - 1]
  if ((now.getTime() - last.date.getTime()) / DAY_MS > STALE_DAYS) return null

  const amounts = sorted.map((c) => c.amount)
  const typical = median(amounts)
  if (typical < MIN_AMOUNT) return null

  const margin = Math.max(typical * AMOUNT_TOLERANCE, MIN_AMOUNT_MARGIN)
  if (amounts.some((a) => Math.abs(a - typical) > margin)) return null

  const spread = Math.max(...amounts) - Math.min(...amounts)
  const tight = spread <= Math.max(typical * TIGHT_TOLERANCE, 0.05)

  return {
    key,
    name: prettyName(key),
    sample: last.description,
    amount: round2(typical),
    minAmount: round2(Math.min(...amounts)),
    maxAmount: round2(Math.max(...amounts)),
    category: dominantCategory(sorted),
    count: sorted.length,
    everyDays: Math.round(median(gaps)),
    firstDate: sorted[0].date.toISOString(),
    lastDate: last.date.toISOString(),
    confidence: tight ? 'alta' : 'media',
  }
}

/** Sin acentos, sin signos y sin espacios: "Barber-Fit" y "barberfit" iguales. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Letras que tienen que coincidir por delante para dar dos nombres por uno. */
const PREFIX_MATCH = 5

/** Margen para dar dos importes mensuales por el mismo cargo. */
const SAME_AMOUNT_TOLERANCE = 0.02
const SAME_AMOUNT_MARGIN = 1

interface TrackedExpense {
  name: string
  amount: number
  sourceKey: string | null
}

/**
 * ¿Está este cargo ya en la lista de gastos fijos?
 *
 * Lo confirmado desde una propuesta trae `sourceKey` y se reconoce exacto. Lo
 * escrito a mano no: el usuario apunta "Gimnasio" y el banco cobra "Recibo
 * SOLVENTIA 3 SL", que no se parecen en nada. Por eso se mira también el
 * importe, que es lo único que comparten de verdad.
 *
 * El sesgo es deliberado: ante la duda, callar. Proponer un duplicado y que
 * se acepte suma el cargo dos veces al total de gastos fijos y desajusta la
 * barra de fijos contra variables; esconder de más solo cuesta escribirlo a
 * mano, que es lo que se hacía antes de esto.
 */
function alreadyTracked(key: string, amount: number, existing: TrackedExpense[]): boolean {
  const normalizedKey = normalize(key)

  return existing.some((expense) => {
    if (expense.sourceKey === key) return true

    const margin = Math.max(expense.amount * SAME_AMOUNT_TOLERANCE, SAME_AMOUNT_MARGIN)
    if (Math.abs(expense.amount - amount) <= margin) return true

    const name = normalize(expense.name)
    if (name.length < PREFIX_MATCH || normalizedKey.length < PREFIX_MATCH) return false
    if (name.includes(normalizedKey) || normalizedKey.includes(name)) return true

    // "barbero" y "barberfit": ni uno contiene al otro, pero es lo mismo.
    return name.slice(0, PREFIX_MATCH) === normalizedKey.slice(0, PREFIX_MATCH)
  })
}

/**
 * Busca gastos fijos en el histórico. `accountId` limita la búsqueda a una
 * cuenta; sin él se miran todas, que es lo normal: la lista de gastos fijos
 * es única aunque los recibos lleguen a cuentas distintas.
 */
export async function detectRecurring(accountId?: string): Promise<RecurringSuggestion[]> {
  const now = new Date()
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS)

  const transactions = await prisma.transaction.findMany({
    where: {
      ...(accountId ? { accountId } : {}),
      // Solo gastos: un ingreso recurrente es la nómina, no un gasto fijo.
      amount: { lt: 0 },
      // El traspaso mensual a la cuenta de ahorro se repite y no es gasto.
      isTransfer: false,
      date: { gte: since },
    },
    select: { date: true, description: true, amount: true, category: true },
    orderBy: { date: 'asc' },
  })

  const groups = new Map<string, Charge[]>()
  for (const tx of transactions) {
    const key = merchantKey(tx.description)
    const charge: Charge = {
      date: tx.date,
      amount: Math.abs(tx.amount),
      description: tx.description,
      category: tx.category,
    }
    const group = groups.get(key)
    if (group) group.push(charge)
    else groups.set(key, [charge])
  }

  const [existing, dismissals] = await Promise.all([
    prisma.fixedExpense.findMany({ select: { name: true, amount: true, sourceKey: true } }),
    prisma.recurringDismissal.findMany({ select: { key: true } }),
  ])

  const dismissed = new Set(dismissals.map((d) => d.key))

  const suggestions: RecurringSuggestion[] = []
  for (const [key, charges] of groups) {
    if (dismissed.has(key)) continue

    // El análisis va antes que el descarte por duplicado: para comparar con
    // lo que ya está apuntado hace falta saber el importe de la serie.
    const suggestion = analyzeSeries(key, charges, now)
    if (!suggestion) continue
    if (alreadyTracked(key, suggestion.amount, existing)) continue

    suggestions.push(suggestion)
  }

  // Lo que más pesa primero, como en el resto de la app.
  return suggestions.sort((a, b) => b.amount - a.amount)
}
