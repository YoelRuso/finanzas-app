import { Router, Request, Response } from 'express'
import { getAllTransactions } from '../services/enableBanking'
import { categorizeWithRules, merchantKey, isValidCategory } from '../services/categorizer'
import { detectTransfers, setTransferManually } from '../services/transferDetector'
import prisma from '../db/client'

const router = Router()

/**
 * Un `dateTo` tipo "2026-07-31" se interpreta como medianoche UTC, lo que
 * dejaría fuera cualquier movimiento con hora de ese mismo día. Lo llevamos
 * al final del día.
 */
function endOfDay(dateStr: string): Date {
  const date = new Date(dateStr)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    date.setUTCHours(23, 59, 59, 999)
  }
  return date
}

/** Filtro de rango de fechas reutilizable por todos los endpoints. */
function dateFilter(dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) return {}
  return {
    date: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: endOfDay(dateTo) } : {}),
    },
  }
}

/** Hasta dónde se intenta llegar hacia atrás cuando no se pide fecha. */
const FULL_HISTORY_DAYS = 5 * 365

/**
 * Lo que PSD2 garantiza sin autenticación reciente en el banco. Son 89 y no
 * 90 porque ING rechaza el día 90 exacto ("more than 90 days in the past").
 */
const FALLBACK_DAYS = 89

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

/**
 * El banco rechaza periodos largos si hace tiempo del último consentimiento:
 * más de 90 días de histórico exige haberse identificado hace poco.
 */
function isPeriodTooLong(err: unknown): boolean {
  return err instanceof Error && err.message.includes('WRONG_TRANSACTIONS_PERIOD')
}

// POST /transactions/sync
// Fetch transactions from Enable Banking and upsert into DB.
// Body: { accountUid, dateFrom?, dateTo? }
// Sin `dateFrom` se pide todo el histórico que el banco quiera dar, y si lo
// rechaza por antiguo se reintenta con los 90 días de siempre.
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { accountUid, dateFrom, dateTo } = req.body as {
      accountUid: string
      dateFrom?: string
      dateTo?: string
    }

    if (!accountUid) {
      res.status(400).json({ error: 'accountUid is required' })
      return
    }

    const account = await prisma.account.findUnique({ where: { uid: accountUid } })
    if (!account) {
      res.status(404).json({ error: 'Account not found in database' })
      return
    }

    let requestedFrom = dateFrom ?? daysAgo(FULL_HISTORY_DAYS)
    let limitedToRecent = false
    let rawTxs

    try {
      rawTxs = await getAllTransactions(accountUid, requestedFrom, dateTo)
    } catch (err: unknown) {
      // Solo se reintenta cuando el rechazo es por el periodo, y solo si no
      // era una fecha que haya pedido el usuario explícitamente.
      if (!isPeriodTooLong(err) || dateFrom) throw err
      requestedFrom = daysAgo(FALLBACK_DAYS)
      limitedToRecent = true
      rawTxs = await getAllTransactions(accountUid, requestedFrom, dateTo)
    }

    let created = 0
    let skipped = 0

    for (const tx of rawTxs) {
      const description =
        tx.remittance_information?.join(' ') ??
        tx.creditor_name ??
        tx.debtor_name ??
        'Sin descripción'

      const amountRaw = parseFloat(tx.transaction_amount.amount)
      const amount = tx.credit_debit_indicator === 'DBIT' ? -Math.abs(amountRaw) : Math.abs(amountRaw)
      const date = new Date(tx.booking_date ?? tx.value_date ?? Date.now())
      const currency = tx.transaction_amount.currency

      const data = {
        date,
        description,
        amount,
        creditDebit: tx.credit_debit_indicator,
        currency,
        category: await categorizeWithRules(description),
        accountId: account.id,
        rawData: JSON.stringify(tx),
      }

      if (tx.entry_reference) {
        const existing = await prisma.transaction.findUnique({
          where: { entryReference: tx.entry_reference },
          select: { categoryManual: true },
        })

        // Nunca pisar una categoría que el usuario ha puesto a mano.
        const { category, ...rest } = data
        const update = existing?.categoryManual ? rest : data

        await prisma.transaction.upsert({
          where: { entryReference: tx.entry_reference },
          update,
          create: { ...data, entryReference: tx.entry_reference },
        })
        created++
      } else {
        // No entry_reference — just insert (may create duplicates if synced twice)
        await prisma.transaction.create({ data })
        created++
      }
    }

    // Los traspasos solo se ven cuando están las dos patas en la base de
    // datos, así que se recalculan después de cada importación.
    const { pairs } = await detectTransfers()

    res.json({
      synced: created,
      skipped,
      total: rawTxs.length,
      transferPairs: pairs,
      dateFrom: requestedFrom,
      // El frontend lo usa para avisar de que el banco no dio más histórico.
      limitedToRecent,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: message })
  }
})

// GET /transactions
// Query params: accountId?, category?, dateFrom?, dateTo?, limit?, offset?
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId, category, dateFrom, dateTo, limit = '200', offset = '0' } = req.query as Record<string, string>

    const transactions = await prisma.transaction.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        ...(category ? { category } : {}),
        ...dateFilter(dateFrom, dateTo),
      },
      orderBy: { date: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: { account: { select: { uid: true, iban: true, name: true, alias: true } } },
    })

    res.json({ transactions })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// GET /transactions/summary
// Returns totals grouped by category for a date range
// Query params: dateFrom?, dateTo?, accountId?
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, accountId } = req.query as Record<string, string>

    const transactions = await prisma.transaction.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        amount: { lt: 0 }, // only expenses
        isTransfer: false, // el dinero movido a otra cuenta propia no es gasto
        ...dateFilter(dateFrom, dateTo),
      },
      select: { category: true, amount: true },
    })

    const summary: Record<string, number> = {}
    for (const tx of transactions) {
      const cat = tx.category ?? 'otros'
      summary[cat] = (summary[cat] ?? 0) + Math.abs(tx.amount)
    }

    const result = Object.entries(summary)
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)

    res.json({ summary: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// GET /transactions/by-account
// Ingresos, gastos y neto de cada cuenta en el rango pedido, más el dinero
// traspasado entre cuentas propias (que no cuenta como ninguna de las dos).
// Query params: dateFrom?, dateTo?
router.get('/by-account', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = req.query as Record<string, string>

    const accounts = await prisma.account.findMany({
      include: { bankSession: { select: { aspspName: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const transactions = await prisma.transaction.findMany({
      where: dateFilter(dateFrom, dateTo),
      select: { accountId: true, amount: true, isTransfer: true },
    })

    interface Totals {
      income: number
      spent: number
      count: number
      transferredIn: number
      transferredOut: number
    }

    const totals = new Map<string, Totals>()
    for (const account of accounts) {
      totals.set(account.id, {
        income: 0,
        spent: 0,
        count: 0,
        transferredIn: 0,
        transferredOut: 0,
      })
    }

    for (const tx of transactions) {
      const entry = totals.get(tx.accountId)
      if (!entry) continue

      if (tx.isTransfer) {
        // Se contabiliza aparte: informa del movimiento de dinero entre
        // cuentas sin contaminar ingresos ni gastos.
        if (tx.amount < 0) entry.transferredOut += Math.abs(tx.amount)
        else entry.transferredIn += tx.amount
        continue
      }

      if (tx.amount < 0) entry.spent += Math.abs(tx.amount)
      else entry.income += tx.amount
      entry.count++
    }

    const round = (n: number) => Math.round(n * 100) / 100

    const result = accounts.map((account) => {
      const t = totals.get(account.id)!
      return {
        accountId: account.id,
        uid: account.uid,
        alias: account.alias,
        name: account.name,
        iban: account.iban,
        currency: account.currency,
        bank: account.bankSession.aspspName,
        income: round(t.income),
        spent: round(t.spent),
        net: round(t.income - t.spent),
        count: t.count,
        transferredIn: round(t.transferredIn),
        transferredOut: round(t.transferredOut),
      }
    })

    res.json({ accounts: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// POST /transactions/detect-transfers
// Recalcula los pares de traspaso. La sincronización ya lo hace sola; esto
// sirve tras conectar una cuenta nueva sin volver a importar nada.
router.post('/detect-transfers', async (_req: Request, res: Response) => {
  try {
    res.json(await detectTransfers())
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// PATCH /transactions/:id/transfer
// Body: { isTransfer }
// Corrección manual del detector. Afecta también a la pareja del movimiento.
router.patch('/:id/transfer', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const { isTransfer } = req.body as { isTransfer?: boolean }

    if (typeof isTransfer !== 'boolean') {
      res.status(400).json({ error: 'isTransfer debe ser true o false' })
      return
    }

    res.json(await setTransferManually(id, isTransfer))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message === 'Movimiento no encontrado' ? 404 : 500
    res.status(status).json({ error: message })
  }
})

// GET /transactions/months
// Meses que tienen movimientos, con gasto e ingreso de cada uno.
// Alimenta el selector de mes del dashboard.
// Query params: accountId?
router.get('/months', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query as Record<string, string>

    const transactions = await prisma.transaction.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        isTransfer: false,
      },
      select: { date: true, amount: true },
    })

    const byMonth = new Map<string, { month: string; spent: number; income: number; count: number }>()

    for (const tx of transactions) {
      // Las fechas de reserva llegan sin hora, así que se agrupan en UTC.
      const month = `${tx.date.getUTCFullYear()}-${String(tx.date.getUTCMonth() + 1).padStart(2, '0')}`
      const entry = byMonth.get(month) ?? { month, spent: 0, income: 0, count: 0 }
      if (tx.amount < 0) entry.spent += Math.abs(tx.amount)
      else entry.income += tx.amount
      entry.count++
      byMonth.set(month, entry)
    }

    const months = Array.from(byMonth.values())
      .map((m) => ({
        ...m,
        spent: Math.round(m.spent * 100) / 100,
        income: Math.round(m.income * 100) / 100,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))

    res.json({ months })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// GET /transactions/pending
// Movimientos agrupados por comercio, para reclasificar en bloque.
// Query params: category? (por defecto 'otros'), dateFrom?, dateTo?, accountId?
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { category = 'otros', dateFrom, dateTo, accountId } = req.query as Record<string, string>

    const transactions = await prisma.transaction.findMany({
      where: {
        ...(category === 'all' ? {} : { category }),
        ...(accountId ? { accountId } : {}),
        // Un traspaso no hay que clasificarlo: no es gasto.
        isTransfer: false,
        ...dateFilter(dateFrom, dateTo),
      },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        category: true,
        categoryManual: true,
      },
    })

    interface Group {
      key: string
      sample: string
      count: number
      total: number
      lastDate: Date
      transactionIds: number[]
    }

    const groups = new Map<string, Group>()

    for (const tx of transactions) {
      const key = merchantKey(tx.description)
      const group = groups.get(key)
      if (group) {
        group.count++
        group.total += Math.abs(tx.amount)
        group.transactionIds.push(tx.id)
        if (tx.date > group.lastDate) group.lastDate = tx.date
      } else {
        groups.set(key, {
          key,
          sample: tx.description,
          count: 1,
          total: Math.abs(tx.amount),
          lastDate: tx.date,
          transactionIds: [tx.id],
        })
      }
    }

    const result = Array.from(groups.values())
      .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)

    res.json({ groups: result, totalTransactions: transactions.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// POST /transactions/recategorize
// Vuelve a pasar el categorizador por todos los movimientos que el usuario
// no haya tocado a mano. Útil tras añadir o cambiar reglas.
router.post('/recategorize', async (_req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { categoryManual: false },
      select: { id: true, description: true, category: true },
    })

    let changed = 0

    for (const tx of transactions) {
      const category = await categorizeWithRules(tx.description)
      if (category !== tx.category) {
        await prisma.transaction.update({ where: { id: tx.id }, data: { category } })
        changed++
      }
    }

    res.json({ reviewed: transactions.length, changed })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// PATCH /transactions/:id/category
// Body: { category, applyToSimilar?: boolean, keyword?: string }
// Cambia la categoría de un movimiento y, opcionalmente, guarda una regla
// que se aplica al resto de movimientos con el mismo concepto.
router.patch('/:id/category', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const { category, applyToSimilar, keyword } = req.body as {
      category: string
      applyToSimilar?: boolean
      keyword?: string
    }

    if (!category || !isValidCategory(category)) {
      res.status(400).json({ error: `Invalid category: ${category}` })
      return
    }

    const transaction = await prisma.transaction.findUnique({ where: { id } })
    if (!transaction) {
      res.status(404).json({ error: 'Transaction not found' })
      return
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: { category, categoryManual: true },
    })

    let applied = 1
    let rule = null

    if (applyToSimilar) {
      const kw = (keyword?.trim() || merchantKey(transaction.description)).toLowerCase()

      rule = await prisma.categoryRule.upsert({
        where: { keyword: kw },
        update: { category },
        create: { keyword: kw, category },
      })

      applied = await applyRule(kw, category)
    }

    res.json({ transaction: updated, applied, rule })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

/**
 * Aplica una keyword a todos los movimientos cuyo concepto la contenga.
 * SQLite no soporta `mode: 'insensitive'` en Prisma, así que el filtrado
 * se hace en memoria.
 */
export async function applyRule(keyword: string, category: string): Promise<number> {
  const lower = keyword.toLowerCase()
  const all = await prisma.transaction.findMany({ select: { id: true, description: true } })
  const ids = all.filter((t) => t.description.toLowerCase().includes(lower)).map((t) => t.id)

  if (ids.length === 0) return 0

  const result = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { category, categoryManual: true },
  })

  return result.count
}

export default router
