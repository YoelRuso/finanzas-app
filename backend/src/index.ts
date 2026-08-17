import express from 'express'
import dotenv from 'dotenv'
import bankingRouter from './routes/banking'
import transactionsRouter from './routes/transactions'
import fixedExpensesRouter from './routes/fixedExpenses'
import categoryRulesRouter from './routes/categoryRules'
import aiAdviceRouter from './routes/aiAdvice'
import chatRouter from './routes/chat'
import receiptsRouter from './routes/receipts'
import settingsRouter from './routes/settings'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Las fotos de tickets viajan en base64 dentro del JSON, así que el límite
// por defecto de 100 kB se queda corto.
app.use(express.json({ limit: '12mb' }))

/**
 * Orígenes permitidos: el servidor de Vite en local y el mismo servidor
 * abierto desde otro equipo de la red (el móvil, para hacer las fotos).
 * Es una app de un solo usuario en su propia red — no hay nada más que
 * proteger aquí.
 */
const ALLOWED_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|(\d{1,3}\.){3}\d{1,3}|[\w-]+\.local)(:\d+)?$/

// CORS for frontend dev server (local o desde la red)
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGIN.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
    res.header('Vary', 'Origin')
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Enable Banking consent callback (must be at root, matches redirect_url)
app.use('/callback', bankingRouter)

// API routes
app.use('/banking', bankingRouter)
app.use('/transactions', transactionsRouter)
app.use('/fixed-expenses', fixedExpensesRouter)
app.use('/category-rules', categoryRulesRouter)
app.use('/ai-advice', aiAdviceRouter)
app.use('/chat', chatRouter)
app.use('/receipts', receiptsRouter)
app.use('/settings', settingsRouter)

// 0.0.0.0 para poder abrir la app desde el móvil por wifi.
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})

export default app
