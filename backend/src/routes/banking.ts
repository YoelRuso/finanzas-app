import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import * as eb from '../services/enableBanking'
import prisma from '../db/client'

const router = Router()

// CSRF state tokens pending callback (in-memory, single-user app)
const pendingStates = new Map<string, { aspspName: string; aspspCountry: string }>()

// GET /banking/aspsps?country=ES
// List available banks
router.get('/aspsps', async (_req: Request, res: Response) => {
  try {
    const country = typeof _req.query.country === 'string' ? _req.query.country : undefined
    const aspsps = await eb.listASPSPs(country)
    res.json({ aspsps })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: message })
  }
})

// POST /banking/auth
// Start consent flow. Body: { aspspName, aspspCountry, psuType? }
// Returns { url } — frontend redirects user there
router.post('/auth', async (req: Request, res: Response) => {
  try {
    const { aspspName, aspspCountry, psuType } = req.body as {
      aspspName: string
      aspspCountry: string
      psuType?: string
    }

    if (!aspspName || !aspspCountry) {
      res.status(400).json({ error: 'aspspName and aspspCountry are required' })
      return
    }

    const state = uuidv4()
    pendingStates.set(state, { aspspName, aspspCountry })

    // Consent valid for 90 days from now
    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    const redirectUrl = process.env.ENABLE_BANKING_REDIRECT_URL ?? 'http://localhost:3000/callback'

    const authResponse = await eb.startAuth({
      aspspName,
      aspspCountry,
      state,
      redirectUrl,
      validUntil,
      psuType,
    })

    res.json({ url: authResponse.url, authorizationId: authResponse.authorization_id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: message })
  }
})

// GET / (mounted at /callback in index.ts)
// Enable Banking redirects here after user consent
router.get('/', async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query as Record<string, string>

    if (error) {
      res.status(400).send(`Authorization failed: ${error_description ?? error}`)
      return
    }

    if (!code || !state) {
      res.status(400).send('Missing code or state')
      return
    }

    const pending = pendingStates.get(state)
    if (!pending) {
      res.status(400).send('Unknown or expired state')
      return
    }
    pendingStates.delete(state)

    const session = await eb.exchangeCodeForSession(code)

    // Persist session
    const bankSession = await prisma.bankSession.create({
      data: {
        sessionId: session.session_id,
        aspspName: session.aspsp.name,
        aspspCountry: session.aspsp.country,
        validUntil: new Date(session.access.valid_until),
      },
    })

    // Persist accounts
    const accounts = session.accounts ?? []
    for (const acc of accounts) {
      const fields = eb.accountFields(acc)

      // El `uid` de Enable Banking identifica la autorización, no la cuenta:
      // al reconectar el mismo banco, la misma cuenta vuelve con un uid
      // nuevo. Quien la identifica de verdad es el IBAN, y solo si no viene
      // se recurre al uid. Buscar por uid aquí duplicaría la cuenta en cada
      // reconexión, dejando los movimientos en la fila vieja.
      const existing = fields.iban
        ? await prisma.account.findFirst({ where: { iban: fields.iban } })
        : await prisma.account.findUnique({ where: { uid: acc.uid } })

      if (existing) {
        // Se mueve al consentimiento nuevo con su uid nuevo. El alias del
        // usuario y los datos que el banco no repita se conservan.
        await prisma.account.update({
          where: { id: existing.id },
          data: {
            uid: acc.uid,
            bankSessionId: bankSession.id,
            ...(fields.iban ? { iban: fields.iban } : {}),
            ...(fields.name ? { name: fields.name } : {}),
            ...(fields.currency ? { currency: fields.currency } : {}),
          },
        })
      } else {
        await prisma.account.create({
          data: { uid: acc.uid, ...fields, bankSessionId: bankSession.id },
        })
      }
    }

    // Las cuentas se han llevado consigo su consentimiento, así que la sesión
    // anterior queda sin nada. Una sesión sin cuentas no sirve para nada.
    await prisma.bankSession.deleteMany({ where: { accounts: { none: {} } } })

    // Una autorización puede salir válida y no traer ninguna cuenta (típico
    // si en el banco no se marca ninguna en la pantalla de selección). El
    // frontend necesita saberlo para no cantar victoria.
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    res.redirect(`${frontendUrl}?connected=${accounts.length}`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).send(`Error processing callback: ${message}`)
  }
})

// GET /banking/sessions
// List stored sessions with their accounts
router.get('/sessions', async (_req: Request, res: Response) => {
  try {
    const sessions = await prisma.bankSession.findMany({
      include: { accounts: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ sessions })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// PATCH /banking/accounts/:uid
// Body: { alias }
// El nombre que el banco devuelve suele ser genérico o vacío, así que el
// usuario le pone el suyo para distinguir cuentas de un vistazo.
router.patch('/accounts/:uid', async (req: Request, res: Response) => {
  try {
    const { alias } = req.body as { alias?: string }
    const trimmed = alias?.trim() ?? ''

    const account = await prisma.account.update({
      where: { uid: req.params.uid },
      // Vaciar el alias vuelve a dejar el nombre del banco.
      data: { alias: trimmed === '' ? null : trimmed },
    })

    res.json({ account })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// DELETE /banking/sessions/:id
// Solo para sesiones sin cuentas: una autorización que salió válida pero
// que el banco dejó vacía no sirve de nada y ensucia la lista.
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await prisma.bankSession.findUnique({
      where: { id: req.params.id },
      include: { accounts: true },
    })

    if (!session) {
      res.status(404).json({ error: 'Sesión no encontrada' })
      return
    }

    if (session.accounts.length > 0) {
      res.status(409).json({
        error: 'La sesión tiene cuentas asociadas y no se puede borrar',
      })
      return
    }

    await prisma.bankSession.delete({ where: { id: session.id } })
    res.json({ deleted: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// GET /banking/accounts/:uid/balances
router.get('/accounts/:uid/balances', async (req: Request, res: Response) => {
  try {
    const balances = await eb.getBalances(req.params.uid)
    res.json({ balances })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: message })
  }
})

export default router
