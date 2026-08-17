import { Router, Request, Response } from 'express'
import prisma from '../db/client'

const router = Router()

/** Clave del presupuesto mensual dentro de la tabla de ajustes. */
const MONTHLY_BUDGET = 'monthlyBudget'

/**
 * Los ajustes se guardan como texto; aquí se devuelven ya tipados para que
 * el frontend no tenga que saber cómo están almacenados.
 */
async function readMonthlyBudget(): Promise<number | null> {
  const row = await prisma.setting.findUnique({ where: { key: MONTHLY_BUDGET } })
  if (!row) return null
  const value = parseFloat(row.value)
  return Number.isFinite(value) && value > 0 ? value : null
}

// GET /settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json({ monthlyBudget: await readMonthlyBudget() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// PUT /settings
// Body: { monthlyBudget: number | null }  — null o 0 borra el presupuesto.
router.put('/', async (req: Request, res: Response) => {
  try {
    const { monthlyBudget } = req.body as { monthlyBudget?: number | null }

    if (monthlyBudget === undefined) {
      res.status(400).json({ error: 'monthlyBudget is required' })
      return
    }

    if (monthlyBudget === null || monthlyBudget <= 0) {
      // Quitar el presupuesto es un caso normal, no un error: se borra y ya.
      await prisma.setting.deleteMany({ where: { key: MONTHLY_BUDGET } })
      res.json({ monthlyBudget: null })
      return
    }

    if (!Number.isFinite(monthlyBudget)) {
      res.status(400).json({ error: 'monthlyBudget must be a number' })
      return
    }

    const value = String(monthlyBudget)
    await prisma.setting.upsert({
      where: { key: MONTHLY_BUDGET },
      create: { key: MONTHLY_BUDGET, value },
      update: { value },
    })

    res.json({ monthlyBudget })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

export default router
