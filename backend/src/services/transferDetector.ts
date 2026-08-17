// Detección de traspasos entre cuentas propias.
//
// Mover 300 € de la cuenta de nómina a la de ahorro llega al banco como dos
// movimientos independientes: un cargo en una cuenta y un abono en la otra.
// Contarlos como gasto e ingreso infla las dos cifras y ensucia el gráfico de
// categorías y los consejos de la IA, así que se emparejan y se marcan.

import prisma from '../db/client'

/** Diferencia máxima entre los dos importes (comisiones de céntimos). */
const AMOUNT_TOLERANCE = 0.02

/** Días de margen: el abono puede tardar en aparecer en la otra cuenta. */
const DAY_WINDOW = 3

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Cómo llaman los bancos a un movimiento entre cuentas. ING escribe
 * "Traspaso interno emitido" y "Traspaso interno recibido".
 *
 * Se exige la palabra en las **dos** patas del par. Solo con importe y fecha
 * hay falsos positivos reales: un Bizum recibido de 6,99 € y una compra de
 * 6,99 € tres días después encajan perfectamente sin tener nada que ver, y
 * darlos por traspaso borraría un gasto de verdad del análisis. Si un banco
 * etiqueta solo un lado, se marca a mano y el detector ya no lo toca.
 */
const TRANSFER_WORDS = ['traspaso', 'transf']

function looksLikeTransfer(description: string): boolean {
  const normalized = description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return TRANSFER_WORDS.some((word) => normalized.includes(word))
}

interface Candidate {
  id: number
  date: Date
  amount: number
  accountId: string
}

/**
 * Vuelve a calcular los traspasos de toda la base de datos.
 *
 * Es idempotente a propósito: primero limpia las marcas automáticas y luego
 * las recalcula, de forma que borrar un movimiento o sincronizar de nuevo no
 * deja pares a medias. Los movimientos que el usuario ha marcado o desmarcado
 * a mano (`transferManual`) no se tocan nunca.
 */
export async function detectTransfers(): Promise<{ pairs: number }> {
  // Con una sola cuenta no puede haber traspasos entre cuentas.
  const accountCount = await prisma.account.count()
  if (accountCount < 2) {
    await prisma.transaction.updateMany({
      where: { transferManual: false, isTransfer: true },
      data: { isTransfer: false, transferPairId: null },
    })
    return { pairs: 0 }
  }

  await prisma.transaction.updateMany({
    where: { transferManual: false },
    data: { isTransfer: false, transferPairId: null },
  })

  const candidates = await prisma.transaction.findMany({
    where: { transferManual: false },
    select: { id: true, date: true, amount: true, accountId: true, description: true },
    orderBy: { date: 'asc' },
  })

  const named = candidates.filter((t) => looksLikeTransfer(t.description))
  const debits = named.filter((t) => t.amount < 0)
  const credits = named.filter((t) => t.amount > 0)

  const used = new Set<number>()
  const pairs: [number, number][] = []

  for (const debit of debits) {
    let best: Candidate | null = null
    let bestGap = Infinity

    for (const credit of credits) {
      if (used.has(credit.id)) continue
      // El dinero tiene que cambiar de cuenta: dentro de la misma no es traspaso.
      if (credit.accountId === debit.accountId) continue
      if (Math.abs(debit.amount + credit.amount) > AMOUNT_TOLERANCE) continue

      const gap = Math.abs(credit.date.getTime() - debit.date.getTime())
      if (gap > DAY_WINDOW * DAY_MS) continue

      // Ante varios abonos que encajan, el más cercano en el tiempo.
      if (gap < bestGap) {
        best = credit
        bestGap = gap
      }
    }

    if (best) {
      used.add(best.id)
      used.add(debit.id)
      pairs.push([debit.id, best.id])
    }
  }

  for (const [debitId, creditId] of pairs) {
    await prisma.transaction.update({
      where: { id: debitId },
      data: { isTransfer: true, transferPairId: creditId },
    })
    await prisma.transaction.update({
      where: { id: creditId },
      data: { isTransfer: true, transferPairId: debitId },
    })
  }

  return { pairs: pairs.length }
}

/**
 * Corrección manual. Marcar o desmarcar a mano fija la decisión: el detector
 * automático ya no vuelve a tocar ese movimiento (ni su pareja).
 */
export async function setTransferManually(
  id: number,
  isTransfer: boolean
): Promise<{ updated: number }> {
  const transaction = await prisma.transaction.findUnique({ where: { id } })
  if (!transaction) throw new Error('Movimiento no encontrado')

  const ids = [id]
  if (transaction.transferPairId) ids.push(transaction.transferPairId)

  const result = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: {
      isTransfer,
      transferManual: true,
      // Al desmarcar se rompe el par por los dos lados.
      ...(isTransfer ? {} : { transferPairId: null }),
    },
  })

  return { updated: result.count }
}
