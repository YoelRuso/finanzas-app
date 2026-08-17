import { Router, Request, Response } from 'express'
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

// POST /fixed-expenses
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, amount, category, icon } = req.body as {
      name: string
      amount: number
      category?: string
      icon?: string
    }

    if (!name || amount == null) {
      res.status(400).json({ error: 'name and amount are required' })
      return
    }

    const expense = await prisma.fixedExpense.create({
      data: { name, amount, category: category ?? null, icon: icon ?? null },
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
