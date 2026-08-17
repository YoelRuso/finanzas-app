// Tipos y agregación de datos compartidos por los dos motores de consejos
// (el local, por reglas, y el de Gemini).

import { createHash } from 'crypto'
import prisma from '../db/client'
import { merchantKey } from './categorizer'

// ── Forma de la respuesta ──────────────────────────────────────

export interface AdvicePoint {
  titulo: string
  detalle: string
}

export interface AdviceAction {
  accion: string
  impacto: string
}

export interface Advice {
  resumen: string
  puntosFuertes: AdvicePoint[]
  areasDeMejora: AdvicePoint[]
  acciones: AdviceAction[]
}

export type AdviceEngine = 'local' | 'gemini'

// ── Datos agregados del mes ────────────────────────────────────

export interface CategoryTotal {
  categoria: string
  total: number
}

export interface MerchantTotal {
  comercio: string
  veces: number
  total: number
  /** Categoría dominante de los movimientos de este comercio. */
  categoria: string
}

export interface MonthContext {
  mes: string
  /**
   * Cuenta a la que se refiere el análisis, o null si abarca todas.
   * Cuando hay cuenta, los gastos fijos van vacíos: están registrados a mano
   * y no sabemos de qué cuenta sale cada uno.
   */
  cuenta: string | null
  ingresos: number
  gastos: number
  balance: number
  movimientos: number
  /** Movimientos que son gasto (excluye ingresos). */
  movimientosGasto: number
  /** Movimientos de gasto que siguen en la categoría "otros". */
  movimientosSinClasificar: number
  porCategoria: CategoryTotal[]
  mesAnterior: { mes: string; gastos: number; porCategoria: CategoryTotal[] } | null
  principalesComercios: MerchantTotal[]
  gastosFijos: { nombre: string; importe: number; categoria: string }[]
  totalGastosFijos: number
}

export function round(value: number): number {
  return Math.round(value * 100) / 100
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "2026-07" -> "julio" */
export function monthName(month: string): string {
  const index = Number(month.split('-')[1]) - 1
  return MESES[index] ?? month
}

/** Rango [inicio, fin) de un mes "YYYY-MM", en UTC. */
function monthBounds(month: string): { start: Date; end: Date } {
  const [year, m] = month.split('-').map(Number)
  return {
    start: new Date(Date.UTC(year, m - 1, 1)),
    end: new Date(Date.UTC(year, m, 1)),
  }
}

function previousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, m - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

async function summarizeMonth(month: string, accountId?: string) {
  const { start, end } = monthBounds(month)

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      ...(accountId ? { accountId } : {}),
      // Un traspaso entre cuentas propias no es ni gasto ni ingreso: contarlo
      // haría que la IA aconsejara sobre dinero que no se ha movido de sitio.
      isTransfer: false,
    },
    select: { description: true, amount: true, category: true },
  })

  let ingresos = 0
  let gastos = 0
  let movimientosGasto = 0
  let movimientosSinClasificar = 0
  const porCategoria = new Map<string, number>()
  const porComercio = new Map<
    string,
    { veces: number; total: number; categorias: Map<string, number> }
  >()

  for (const tx of transactions) {
    if (tx.amount >= 0) {
      ingresos += tx.amount
      continue
    }

    const importe = Math.abs(tx.amount)
    gastos += importe
    movimientosGasto++

    const categoria = tx.category ?? 'otros'
    if (categoria === 'otros') movimientosSinClasificar++
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + importe)

    const comercio = merchantKey(tx.description)
    const acumulado = porComercio.get(comercio) ?? {
      veces: 0,
      total: 0,
      categorias: new Map<string, number>(),
    }
    acumulado.veces++
    acumulado.total += importe
    acumulado.categorias.set(categoria, (acumulado.categorias.get(categoria) ?? 0) + 1)
    porComercio.set(comercio, acumulado)
  }

  return {
    ingresos: round(ingresos),
    gastos: round(gastos),
    movimientos: transactions.length,
    movimientosGasto,
    movimientosSinClasificar,
    porCategoria: Array.from(porCategoria.entries())
      .map(([categoria, total]) => ({ categoria, total: round(total) }))
      .sort((a, b) => b.total - a.total),
    principalesComercios: Array.from(porComercio.entries())
      .map(([comercio, v]) => ({
        comercio,
        veces: v.veces,
        total: round(v.total),
        categoria:
          Array.from(v.categorias.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'otros',
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12),
  }
}

/**
 * Reúne todo lo que hace falta para aconsejar sobre un mes.
 * Con `accountId` el análisis se limita a esa cuenta.
 */
export async function buildMonthContext(
  month: string,
  accountId?: string
): Promise<MonthContext> {
  const actual = await summarizeMonth(month, accountId)
  const anteriorMes = previousMonth(month)
  const anterior = await summarizeMonth(anteriorMes, accountId)

  const account = accountId
    ? await prisma.account.findUnique({
        where: { id: accountId },
        select: { alias: true, name: true, iban: true },
      })
    : null

  // Los gastos fijos no están repartidos por cuenta, así que solo tienen
  // sentido en el análisis global.
  const fixedExpenses = accountId
    ? []
    : await prisma.fixedExpense.findMany({ orderBy: { amount: 'desc' } })

  return {
    mes: month,
    cuenta: account
      ? account.alias ?? account.name ?? (account.iban ? `····${account.iban.slice(-4)}` : 'Cuenta')
      : null,
    ingresos: actual.ingresos,
    gastos: actual.gastos,
    balance: round(actual.ingresos - actual.gastos),
    movimientos: actual.movimientos,
    movimientosGasto: actual.movimientosGasto,
    movimientosSinClasificar: actual.movimientosSinClasificar,
    porCategoria: actual.porCategoria,
    mesAnterior:
      anterior.movimientos > 0
        ? { mes: anteriorMes, gastos: anterior.gastos, porCategoria: anterior.porCategoria }
        : null,
    principalesComercios: actual.principalesComercios,
    gastosFijos: fixedExpenses.map((e) => ({
      nombre: e.name,
      importe: e.amount,
      categoria: e.category ?? 'otros',
    })),
    totalGastosFijos: round(fixedExpenses.reduce((s, e) => s + e.amount, 0)),
  }
}

/** Huella de los datos: si cambia, el consejo cacheado está obsoleto. */
export function hashContext(context: MonthContext): string {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex').slice(0, 16)
}
