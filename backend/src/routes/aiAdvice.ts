import { Router, Request, Response } from 'express'
import {
  buildMonthContext,
  hashContext,
  type Advice,
  type AdviceEngine,
} from '../services/advice'
import { generateLocalAdvice } from '../services/localAdvisor'
import {
  generateAdvice,
  GeminiConfigError,
  GeminiEmptyError,
  GeminiApiError,
} from '../services/gemini'
import prisma from '../db/client'

/** Etiqueta que se guarda en `model` cuando el análisis es por reglas. */
const LOCAL_MODEL = 'análisis local'

const router = Router()

const MONTH_PATTERN = /^\d{4}-\d{2}$/

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Los consejos se cachean por mes y por cuenta. "all" es el análisis de
 * todas las cuentas juntas; si no, el id de la cuenta analizada.
 */
function scopeOf(accountId?: string): string {
  return accountId && accountId.trim() !== '' ? accountId.trim() : 'all'
}

/** Serializa el consejo guardado, marcándolo obsoleto si los datos cambiaron. */
function serialize(
  record: { content: string; dataHash: string; model: string; createdAt: Date },
  currentHash: string
) {
  return {
    advice: JSON.parse(record.content) as Advice,
    model: record.model,
    generatedAt: record.createdAt,
    stale: record.dataHash !== currentHash,
  }
}

// GET /ai-advice?month=YYYY-MM
// Devuelve el consejo cacheado. No llama a la API: generar cuesta dinero,
// así que solo se genera cuando el usuario lo pide explícitamente.
router.get('/', async (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || currentMonth()
    if (!MONTH_PATTERN.test(month)) {
      res.status(400).json({ error: 'month debe tener el formato YYYY-MM' })
      return
    }

    const accountId = req.query.accountId as string | undefined
    const accountScope = scopeOf(accountId)

    const record = await prisma.aiAdvice.findUnique({
      where: { month_accountScope: { month, accountScope } },
    })
    if (!record) {
      res.json({ advice: null, month })
      return
    }

    const context = await buildMonthContext(month, accountId)
    res.json({ month, ...serialize(record, hashContext(context)) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// POST /ai-advice/generate
// Body: { month?: 'YYYY-MM' }
// Llama a Gemini y guarda el resultado.
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const month = (req.body?.month as string) || currentMonth()
    if (!MONTH_PATTERN.test(month)) {
      res.status(400).json({ error: 'month debe tener el formato YYYY-MM' })
      return
    }

    const engine = (req.body?.engine as AdviceEngine) ?? 'local'
    if (engine !== 'local' && engine !== 'gemini') {
      res.status(400).json({ error: "engine debe ser 'local' o 'gemini'" })
      return
    }

    const accountId = req.body?.accountId as string | undefined
    const accountScope = scopeOf(accountId)

    const context = await buildMonthContext(month, accountId)

    if (context.movimientos === 0) {
      res.status(422).json({ error: 'No hay movimientos en este mes para analizar' })
      return
    }

    const { advice, model } =
      engine === 'local'
        ? { advice: generateLocalAdvice(context), model: LOCAL_MODEL }
        : await generateAdvice(context)

    const dataHash = hashContext(context)
    const content = JSON.stringify(advice)

    const record = await prisma.aiAdvice.upsert({
      where: { month_accountScope: { month, accountScope } },
      update: { content, dataHash, model },
      create: { month, accountScope, content, dataHash, model },
    })

    res.json({ month, ...serialize(record, dataHash) })
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

// GET /ai-advice/context?month=YYYY-MM
// Los datos exactos que se le mandan al modelo. Útil para depurar.
router.get('/context', async (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || currentMonth()
    if (!MONTH_PATTERN.test(month)) {
      res.status(400).json({ error: 'month debe tener el formato YYYY-MM' })
      return
    }
    res.json({
      context: await buildMonthContext(month, req.query.accountId as string | undefined),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

export default router
