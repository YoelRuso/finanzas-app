import { Router, Request, Response } from 'express'
import { answerChat, HISTORY_LIMIT } from '../services/chat'
import { buildMonthContext } from '../services/advice'
import {
  GeminiConfigError,
  GeminiEmptyError,
  GeminiApiError,
} from '../services/gemini'
import prisma from '../db/client'

const router = Router()

const MONTH_PATTERN = /^\d{4}-\d{2}$/

/** Mensajes que se devuelven al abrir el chat. */
const THREAD_LIMIT = 100

/** Tope de una pregunta. Es un chat sobre gastos, no un sitio donde pegar. */
const MAX_QUESTION = 2000

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Mismo criterio que en los consejos: "all" o el id de la cuenta. */
function scopeOf(accountId?: string): string {
  return accountId && accountId.trim() !== '' ? accountId.trim() : 'all'
}

function serialize(message: {
  id: number
  role: string
  content: string
  month: string | null
  model: string | null
  createdAt: Date
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    month: message.month,
    model: message.model,
    createdAt: message.createdAt,
  }
}

// GET /chat
// El hilo entero, de más antiguo a más reciente.
router.get('/', async (_req: Request, res: Response) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: THREAD_LIMIT,
    })
    res.json({ messages: messages.reverse().map(serialize) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// POST /chat
// Body: { mensaje, month?: 'YYYY-MM', accountId? }
// Cada pregunta es una llamada a la API (o varias, si el modelo pide datos),
// así que no hay recarga automática en el frontend: se envía cuando se envía.
router.post('/', async (req: Request, res: Response) => {
  try {
    const question = (req.body?.mensaje as string | undefined)?.trim()
    if (!question) {
      res.status(400).json({ error: 'mensaje es obligatorio' })
      return
    }
    if (question.length > MAX_QUESTION) {
      res.status(400).json({ error: `El mensaje no puede pasar de ${MAX_QUESTION} caracteres` })
      return
    }

    const month = (req.body?.month as string) || currentMonth()
    if (!MONTH_PATTERN.test(month)) {
      res.status(400).json({ error: 'month debe tener el formato YYYY-MM' })
      return
    }

    const accountId = req.body?.accountId as string | undefined

    // La historia se lee antes de guardar la pregunta nueva: si no, entraría
    // dos veces (como historia y como pregunta).
    const previous = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    })

    const context = await buildMonthContext(month, accountId)

    const reply = await answerChat({
      question,
      history: previous.reverse(),
      context,
      toolContext: { accountId },
    })

    const accountScope = scopeOf(accountId)
    const asked = await prisma.chatMessage.create({
      data: { role: 'user', content: question, month, accountScope },
    })
    const answered = await prisma.chatMessage.create({
      data: {
        role: 'assistant',
        content: reply.text,
        month,
        accountScope,
        model: reply.model,
      },
    })

    res.json({
      messages: [serialize(asked), serialize(answered)],
      toolsUsed: reply.toolsUsed,
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

// DELETE /chat
// Borra el hilo entero. Es lo que se usa para empezar de cero cuando el
// modelo se ha quedado enganchado a un tema.
router.delete('/', async (_req: Request, res: Response) => {
  try {
    const { count } = await prisma.chatMessage.deleteMany()
    res.json({ deleted: count })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

export default router
