import { Router, Request, Response } from 'express'
import { CATEGORIES, isValidCategory, merchantKey } from '../services/categorizer'
import {
  suggestCategories,
  MAX_GROUPS,
  type PendingGroup,
} from '../services/categorySuggester'
import {
  GeminiConfigError,
  GeminiEmptyError,
  GeminiApiError,
} from '../services/gemini'
import { applyRule } from './transactions'
import prisma from '../db/client'

const router = Router()

// GET /category-rules
// Cada regla viene con `matches`: cuántos movimientos está clasificando ahora
// mismo. Sirve para distinguir las reglas que trabajan de las que quedaron
// de un comercio en el que ya no compras.
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rules = await prisma.categoryRule.findMany({ orderBy: { keyword: 'asc' } })

    // SQLite no admite `contains` insensible a mayúsculas en Prisma, así que
    // se cuenta en memoria con el mismo criterio con el que se aplican.
    const transactions = await prisma.transaction.findMany({ select: { description: true } })
    const descriptions = transactions.map((t) => t.description.toLowerCase())

    const withMatches = rules.map((rule) => {
      const keyword = rule.keyword.toLowerCase()
      return {
        ...rule,
        matches: descriptions.filter((d) => d.includes(keyword)).length,
      }
    })

    res.json({ rules: withMatches, categories: CATEGORIES })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// POST /category-rules
// Body: { keyword, category }
// Crea (o actualiza) una regla y la aplica a los movimientos existentes.
router.post('/', async (req: Request, res: Response) => {
  try {
    const { keyword, category } = req.body as { keyword: string; category: string }

    const kw = keyword?.trim().toLowerCase()
    if (!kw) {
      res.status(400).json({ error: 'keyword is required' })
      return
    }
    if (!category || !isValidCategory(category)) {
      res.status(400).json({ error: `Invalid category: ${category}` })
      return
    }

    const rule = await prisma.categoryRule.upsert({
      where: { keyword: kw },
      update: { category },
      create: { keyword: kw, category },
    })

    const applied = await applyRule(kw, category)

    res.status(201).json({ rule, applied })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// POST /category-rules/suggest
// Body: { accountId? }
// Pide a la IA una categoría para cada comercio que sigue en «otros».
// No guarda nada: la propuesta se confirma desde la pantalla, comercio a
// comercio, y es esa confirmación la que crea la regla.
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const accountId = req.body?.accountId as string | undefined

    const transactions = await prisma.transaction.findMany({
      where: {
        category: 'otros',
        ...(accountId ? { accountId } : {}),
        // Un traspaso no se clasifica: no es gasto.
        isTransfer: false,
      },
      orderBy: { date: 'desc' },
      select: { description: true, amount: true },
    })

    // Mismo agrupado que la lista de pendientes, para que las claves casen.
    const groups = new Map<string, PendingGroup>()
    for (const tx of transactions) {
      const key = merchantKey(tx.description)
      const group = groups.get(key)
      if (group) {
        group.count++
        group.total += Math.abs(tx.amount)
      } else {
        groups.set(key, { key, sample: tx.description, count: 1, total: Math.abs(tx.amount) })
      }
    }

    // Primero los comercios donde hay más dinero en juego: si hay más de los
    // que caben en una llamada, que entren los que más pesan.
    const pending = Array.from(groups.values())
      .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)

    const { suggestions, model } = await suggestCategories(pending)

    res.json({
      suggestions,
      model,
      /** Comercios que no han entrado en esta tanda. */
      remaining: Math.max(0, pending.length - MAX_GROUPS),
    })
  } catch (err: unknown) {
    if (err instanceof GeminiConfigError) {
      res.status(503).json({ error: err.message })
      return
    }
    if (err instanceof GeminiEmptyError) {
      res.status(502).json({ error: err.message })
      return
    }
    if (err instanceof GeminiApiError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: message })
  }
})

// DELETE /category-rules/:id
// Borra la regla. Los movimientos ya clasificados no se tocan.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    await prisma.categoryRule.delete({ where: { id } })
    res.json({ deleted: true })
  } catch {
    res.status(404).json({ error: 'Rule not found' })
  }
})

export default router
