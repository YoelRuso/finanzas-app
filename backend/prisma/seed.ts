// Datos ficticios para probar la app y sacar capturas sin tocar datos reales.
//
// Uso (siempre contra una base de datos aparte, nunca la de verdad):
//   DATABASE_URL="file:./demo.db" pnpm prisma migrate deploy
//   DATABASE_URL="file:./demo.db" pnpm db:seed
//   DATABASE_URL="file:./demo.db" DEMO_MODE=1 pnpm dev
//
// El script se niega a ejecutarse si DATABASE_URL no contiene "demo", para que
// no pueda machacar por error la base de datos con movimientos bancarios reales.

import { PrismaClient } from '@prisma/client'

const url = process.env.DATABASE_URL ?? ''
if (!url.includes('demo')) {
  console.error('El seed solo funciona con una base de datos "demo" (p. ej. file:./demo.db).')
  process.exit(1)
}

const prisma = new PrismaClient()

// Generador pseudoaleatorio con semilla: los datos son siempre los mismos.
let state = 20261028
function rnd(): number {
  state = (state * 1664525 + 1013904223) % 4294967296
  return state / 4294967296
}
const between = (min: number, max: number) => Math.round((min + rnd() * (max - min)) * 100) / 100
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]

// Último día con movimientos: las capturas se hacen "a 28 de octubre de 2026".
const LAST_DAY = new Date(Date.UTC(2026, 9, 28, 12))
const FIRST_MONTH = { year: 2026, month: 5 } // junio (0-indexado)
const MONTHS = 5

type Tx = {
  date: Date
  description: string
  amount: number
  category: string
  accountKey: 'main' | 'savings'
  isTransfer?: boolean
  pairKey?: string
}

const day = (monthIndex: number, d: number) =>
  new Date(Date.UTC(FIRST_MONTH.year, FIRST_MONTH.month + monthIndex, d, 10))

const GROCERIES = ['MERCADONA', 'LIDL', 'CARREFOUR EXPRESS', 'DIA', 'ALDI'] as const
const RESTAURANTS = ['RESTAURANTE LA PLAZA', 'PIZZERIA NAPOLI', 'BAR EL ROBLE', 'TAKE AWAY SUSHI'] as const
const SHOPS = ['AMAZON', 'ZARA', 'DECATHLON', 'PCCOMPONENTES'] as const

const txs: Tx[] = []

for (let m = 0; m < MONTHS; m++) {
  txs.push({ date: day(m, 28), description: 'NOMINA EMPRESA DEMO SL', amount: 1850, category: 'ingresos', accountKey: 'main' })
  txs.push({ date: day(m, 3), description: 'ALQUILER PISO', amount: -520, category: 'vivienda', accountKey: 'main' })
  txs.push({ date: day(m, 7), description: 'RECIBO LUZ', amount: -between(38, 66), category: 'vivienda', accountKey: 'main' })
  txs.push({ date: day(m, 9), description: 'RECIBO INTERNET FIBRA', amount: -34.9, category: 'vivienda', accountKey: 'main' })
  txs.push({ date: day(m, 11), description: 'NETFLIX', amount: -12.99, category: 'suscripciones', accountKey: 'main' })
  txs.push({ date: day(m, 13), description: 'SPOTIFY', amount: -10.99, category: 'suscripciones', accountKey: 'main' })
  txs.push({ date: day(m, 2), description: 'GIMNASIO FITZONE', amount: -29.9, category: 'deporte', accountKey: 'main' })
  txs.push({ date: day(m, 15), description: 'CURSO ONLINE PLATAFORMA', amount: m % 2 === 0 ? -19.99 : -9.99, category: 'educacion', accountKey: 'main' })

  // Traspaso a la cuenta de ahorro (par de movimientos espejo).
  txs.push({ date: day(m, 5), description: 'TRASPASO A AHORRO', amount: -200, category: 'transferencias', accountKey: 'main', isTransfer: true, pairKey: `t${m}` })
  txs.push({ date: day(m, 5), description: 'TRASPASO DESDE NOMINA', amount: 200, category: 'transferencias', accountKey: 'savings', isTransfer: true, pairKey: `t${m}` })

  for (let i = 0; i < 9; i++) {
    txs.push({ date: day(m, 1 + Math.floor(rnd() * 27)), description: `PAGO EN ${pick(GROCERIES)}`, amount: -between(9, 58), category: 'alimentacion', accountKey: 'main' })
  }
  for (let i = 0; i < 3; i++) {
    txs.push({ date: day(m, 1 + Math.floor(rnd() * 27)), description: 'GASOLINERA REPSOL', amount: -between(32, 54), category: 'transporte', accountKey: 'main' })
  }
  txs.push({ date: day(m, 6), description: 'ABONO TRANSPORTE', amount: -20, category: 'transporte', accountKey: 'main' })
  for (let i = 0; i < 4; i++) {
    txs.push({ date: day(m, 1 + Math.floor(rnd() * 27)), description: pick(RESTAURANTS), amount: -between(14, 48), category: 'ocio', accountKey: 'main' })
  }
  txs.push({ date: day(m, 17), description: 'CINES', amount: -between(9, 22), category: 'ocio', accountKey: 'main' })
  txs.push({ date: day(m, 19), description: 'FARMACIA', amount: -between(6, 24), category: 'salud', accountKey: 'main' })
  for (let i = 0; i < 2; i++) {
    txs.push({ date: day(m, 1 + Math.floor(rnd() * 27)), description: pick(SHOPS), amount: -between(15, 95), category: 'compras', accountKey: 'main' })
  }
  txs.push({ date: day(m, 20), description: 'BIZUM RECIBIDO AMIGO', amount: between(8, 30), category: 'transferencias', accountKey: 'main' })
}

async function main() {
  await prisma.chatMessage.deleteMany()
  await prisma.aiAdvice.deleteMany()
  await prisma.receiptItem.deleteMany()
  await prisma.receipt.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.fixedExpense.deleteMany()
  await prisma.recurringDismissal.deleteMany()
  await prisma.categoryRule.deleteMany()
  await prisma.productRule.deleteMany()
  await prisma.setting.deleteMany()
  await prisma.account.deleteMany()
  await prisma.bankSession.deleteMany()

  const session = await prisma.bankSession.create({
    data: {
      sessionId: 'demo-session',
      aspspName: 'Banco Demo',
      aspspCountry: 'ES',
      validUntil: new Date(Date.UTC(2027, 0, 20)),
    },
  })
  const main = await prisma.account.create({
    data: { uid: 'demo-main', iban: 'ES00 0000 0000 0000 0000 0001', alias: 'Nómina', currency: 'EUR', bankSessionId: session.id },
  })
  const savings = await prisma.account.create({
    data: { uid: 'demo-savings', iban: 'ES00 0000 0000 0000 0000 0002', alias: 'Ahorro', currency: 'EUR', bankSessionId: session.id },
  })
  const accountId = { main: main.id, savings: savings.id }

  await prisma.setting.createMany({
    data: [
      { key: 'monthlyBudget', value: '1400' },
      { key: 'demoOpeningBalance:demo-main', value: '1200' },
      { key: 'demoOpeningBalance:demo-savings', value: '3000' },
    ],
  })

  txs.sort((a, b) => a.date.getTime() - b.date.getTime())
  const created = new Map<string, number>()
  const pairs: [number, number][] = []
  let n = 0
  for (const t of txs) {
    if (t.date > LAST_DAY) continue
    const row = await prisma.transaction.create({
      data: {
        entryReference: `demo-${++n}`,
        date: t.date,
        description: t.description,
        amount: t.amount,
        creditDebit: t.amount < 0 ? 'DBIT' : 'CRDT',
        currency: 'EUR',
        category: t.category,
        isTransfer: t.isTransfer ?? false,
        accountId: accountId[t.accountKey],
      },
    })
    if (t.pairKey) {
      const other = created.get(t.pairKey)
      if (other) pairs.push([other, row.id])
      else created.set(t.pairKey, row.id)
    }
  }
  for (const [a, b] of pairs) {
    await prisma.transaction.update({ where: { id: a }, data: { transferPairId: b } })
    await prisma.transaction.update({ where: { id: b }, data: { transferPairId: a } })
  }

  await prisma.fixedExpense.createMany({
    data: [
      { name: 'Alquiler', amount: 520, category: 'vivienda', icon: '🏠' },
      { name: 'Gimnasio', amount: 29.9, category: 'deporte', icon: '🏋️' },
      { name: 'Netflix', amount: 12.99, category: 'suscripciones', icon: '🎬' },
      { name: 'Spotify', amount: 10.99, category: 'suscripciones', icon: '🎵' },
    ],
  })

  // Tickets de ejemplo ligados a compras de supermercado de octubre.
  const octGroceries = await prisma.transaction.findMany({
    where: { category: 'alimentacion', date: { gte: new Date(Date.UTC(2026, 9, 1)) } },
    orderBy: { date: 'asc' },
    take: 3,
  })
  const items = [
    [['Manzanas', 'frutas_verduras', 3.2], ['Pechuga de pollo', 'carne', 6.4], ['Leche entera', 'lacteos_huevos', 5.1], ['Pan de molde', 'panaderia', 1.6], ['Detergente', 'drogueria', 7.9]],
    [['Plátanos', 'frutas_verduras', 2.4], ['Salmón', 'pescado', 8.9], ['Yogur natural', 'lacteos_huevos', 2.3], ['Galletas', 'snacks_dulces', 2.1], ['Gel de ducha', 'higiene', 3.5]],
    [['Tomates', 'frutas_verduras', 2.9], ['Pasta', 'despensa', 1.8], ['Pizza congelada', 'congelados', 3.4], ['Cerveza', 'alcohol', 4.2], ['Papel higiénico', 'hogar', 5.6]],
  ] as const
  for (let i = 0; i < octGroceries.length; i++) {
    const tx = octGroceries[i]
    const lines = items[i]
    const total = Math.round(lines.reduce((s, l) => s + l[2], 0) * 100) / 100
    await prisma.receipt.create({
      data: {
        merchant: tx.description.replace('PAGO EN ', ''),
        date: tx.date,
        total,
        matchStatus: 'auto',
        transactionId: tx.id,
        model: 'demo',
        items: { create: lines.map(([name, subcategory, t]) => ({ name, subcategory, total: t, unitPrice: t })) },
      },
    })
  }

  const sample = [
    ['user', '¿En qué he gastado más en octubre?'],
    ['assistant', 'En octubre tu mayor gasto fue la vivienda (alquiler, luz e internet), seguido de la alimentación. Si quieres recortar, el supermercado es donde más margen tienes.'],
    ['user', '¿Y cuánto he ahorrado este mes?'],
    ['assistant', 'Este mes has traspasado 200 € a tu cuenta de ahorro y tus ingresos superan a tus gastos, así que el balance es positivo. (Datos de demostración.)'],
  ] as const
  let when = Date.UTC(2026, 9, 28, 9)
  for (const [role, content] of sample) {
    await prisma.chatMessage.create({
      data: { role, content, month: '2026-10', createdAt: new Date((when += 60_000)), model: role === 'assistant' ? 'demo' : null },
    })
  }

  console.log(`Seed listo: ${n} movimientos de demostración, ${octGroceries.length} tickets.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
