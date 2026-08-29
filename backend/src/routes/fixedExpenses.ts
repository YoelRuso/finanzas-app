import { Router, Request, Response } from 'express'
import { detectRecurring } from '../services/recurringDetector'
import prisma from '../db/client'

const router = Router()

// GET /fixed-expenses
router.get('/', async (_req: Request, res: Response) => {
  try {
    const fixedExpenses = await prisma.fixedExpense.findMany({
      orderBy: { amount: 'desc' },
    })
    const total = fixedExpenses.reduce((s, e) => s + e.amount, 0)
    res.json({ fixedExpenses, total })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// GET /fixed-expenses/suggestions
// Query params: accountId?
// Gastos fijos que el histórico delata y todavía no están en la lista. No
// escribe nada: crear el gasto es el POST de abajo, con el usuario delante.
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query as Record<string, string>
    const suggestions = await detectRecurring(accountId || undefined)
    res.json({ suggestions })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// POST /fixed-expenses/dismissals
// Body: { key }
// "Esto no es un gasto fijo". Se recuerda para no volver a proponerlo.
router.post('/dismissals', async (req: Request, res: Response) => {
  try {
    const key = (req.body?.key as string | undefined)?.trim()
    if (!key) {
      res.status(400).json({ error: 'key is required' })
      return
    }

    await prisma.recurringDismissal.upsert({
      where: { key },
      update: {},
      create: { key },
    })

    res.status(201).json({ dismissed: key })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// DELETE /fixed-expenses/dismissals/:key
// Deshace un descarte: el comercio vuelve a proponerse.
router.delete('/dismissals/:key', async (req: Request, res: Response) => {
  try {
    await prisma.recurringDismissal.delete({
      where: { key: decodeURIComponent(req.params.key) },
    })
    res.json({ restored: true })
  } catch {
    res.status(404).json({ error: 'Dismissal not found' })
  }
})

// POST /fixed-expenses
// `sourceKey` lo manda la pantalla al confirmar una propuesta del detector:
// deja constancia de qué comercio la originó para no volver a ofrecerla.
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, amount, category, icon, sourceKey } = req.body as {
      name: string
      amount: number
      category?: string
      icon?: string
      sourceKey?: string
    }

    if (!name || amount == null) {
      res.status(400).json({ error: 'name and amount are required' })
      return
    }

    const expense = await prisma.fixedExpense.create({
      data: {
        name,
        amount,
        category: category ?? null,
        icon: icon ?? null,
        sourceKey: sourceKey?.trim() || null,
      },
    })
    res.status(201).json({ expense })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// PUT /fixed-expenses/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const { name, amount, category, icon } = req.body as {
      name?: string
      amount?: number
      category?: string
      icon?: string
    }

    const expense = await prisma.fixedExpense.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(icon !== undefined ? { icon } : {}),
      },
    })
    res.json({ expense })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(404).json({ error: 'Fixed expense not found' })
  }
})

// DELETE /fixed-expenses/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    await prisma.fixedExpense.delete({ where: { id } })
    res.json({ deleted: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(404).json({ error: 'Fixed expense not found' })
  }
})

export default router
