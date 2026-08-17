import { Router, Request, Response } from 'express'
import prisma from '../db/client'
import { scanReceipt, ReceiptScanError } from '../services/receiptScanner'
import {
  parseDataUrl,
  saveImage,
  deleteImage,
  resolveImage,
  mediaTypeOf,
  ImageError,
} from '../services/receiptImages'
import {
  findCandidates,
  pickAutoMatch,
  applyProductRules,
  saveProductRule,
} from '../services/receiptMatcher'
import {
  SUBCATEGORIES,
  SUBCATEGORY_PARENT,
  isValidSubcategory,
  isFood,
  type Subcategory,
} from '../services/subcategories'
import { GeminiConfigError, GeminiApiError, GeminiEmptyError } from '../services/gemini'

const router = Router()

const receiptWithItems = {
  items: { orderBy: { id: 'asc' } },
  transaction: { select: { id: true, date: true, description: true, amount: true } },
} as const

/** Traduce cualquier fallo a un status y un mensaje que se pueda enseñar. */
function fail(res: Response, err: unknown): void {
  if (err instanceof GeminiConfigError) {
    res.status(503).json({ error: err.message })
    return
  }
  if (err instanceof GeminiApiError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err instanceof GeminiEmptyError) {
    res.status(422).json({ error: err.message })
    return
  }
  if (err instanceof ImageError || err instanceof ReceiptScanError) {
    res.status(400).json({ error: err.message })
    return
  }
  const message = err instanceof Error ? err.message : 'Error desconocido'
  res.status(500).json({ error: message })
}

/** Igual que en transactions.ts: un `dateTo` sin hora cubre el día entero. */
function endOfDay(dateStr: string): Date {
  const date = new Date(dateStr)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    date.setUTCHours(23, 59, 59, 999)
  }
  return date
}

function dateFilter(dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) return {}
  return {
    date: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: endOfDay(dateTo) } : {}),
    },
  }
}

/** La fecha del ticket, o hoy si el ticket no la traía o no se entiende. */
function parseReceiptDate(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isNaN(date.getTime())) return date
  }
  const today = new Date()
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

// POST /receipts/scan
// Body: { image: dataURL | base64 }
// Lee la foto, guarda el ticket desglosado e intenta vincularlo con el
// movimiento bancario que lo pagó.
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { image } = req.body as { image?: string }

    if (!image) {
      res.status(400).json({ error: 'Falta la imagen del ticket' })
      return
    }

    const parsed = parseDataUrl(image)
    const { receipt: scanned, model } = await scanReceipt(parsed.base64, parsed.mediaType)

    // Las reglas propias del usuario pisan lo que haya dicho la IA.
    const items = await Promise.all(
      scanned.lineas.map(async (line) => {
        const override = await applyProductRules(line.nombre)
        return {
          name: line.nombre,
          quantity: line.cantidad,
          unitPrice: line.precioUnitario,
          total: round(line.total),
          subcategory: override ?? line.subcategoria,
          manual: false,
        }
      })
    )

    const filename = await saveImage(parsed)
    const date = parseReceiptDate(scanned.fecha)
    const total = round(scanned.total)

    const candidates = await findCandidates(total, date, scanned.comercio)
    const auto = pickAutoMatch(candidates)

    const created = await prisma.receipt.create({
      data: {
        merchant: scanned.comercio,
        date,
        total,
        currency: scanned.moneda,
        imagePath: filename,
        warning: scanned.aviso || null,
        model,
        rawData: JSON.stringify(scanned),
        matchStatus: auto ? 'auto' : 'none',
        transactionId: auto?.id ?? null,
        items: { create: items },
      },
      include: receiptWithItems,
    })

    res.json({
      receipt: created,
      // Si no se ha podido decidir solo, el usuario elige entre estos.
      candidates: auto ? [] : candidates,
    })
  } catch (err: unknown) {
    fail(res, err)
  }
})

/**
 * Filtro por la cuenta que pagó el ticket. Un ticket sin movimiento
 * (compra en efectivo) no tiene cuenta, así que al filtrar queda fuera:
 * solo aparece en la vista global.
 */
function accountFilter(accountId?: string) {
  return accountId ? { transaction: { accountId } } : {}
}

// GET /receipts?dateFrom&dateTo&accountId
router.get('/', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, accountId } = req.query as Record<string, string>

    const receipts = await prisma.receipt.findMany({
      where: { ...dateFilter(dateFrom, dateTo), ...accountFilter(accountId) },
      orderBy: { date: 'desc' },
      include: receiptWithItems,
    })

    res.json({ receipts })
  } catch (err: unknown) {
    fail(res, err)
  }
})

// GET /receipts/summary?dateFrom&dateTo&accountId
// Desglose de la cesta por subcategoría. Los tickets vinculados no suman
// gasto nuevo (ya está contado en el movimiento); los sueltos sí.
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, accountId } = req.query as Record<string, string>

    const receipts = await prisma.receipt.findMany({
      where: { ...dateFilter(dateFrom, dateTo), ...accountFilter(accountId) },
      include: { items: true },
    })

    const bySubcategory = new Map<string, number>()
    const byCategory = new Map<string, number>()
    let food = 0
    let nonFood = 0
    let itemCount = 0

    for (const receipt of receipts) {
      for (const item of receipt.items) {
        const sub = isValidSubcategory(item.subcategory)
          ? (item.subcategory as Subcategory)
          : 'otros_ticket'
        const parent = SUBCATEGORY_PARENT[sub]

        bySubcategory.set(sub, (bySubcategory.get(sub) ?? 0) + item.total)
        byCategory.set(parent, (byCategory.get(parent) ?? 0) + item.total)
        if (isFood(sub)) food += item.total
        else nonFood += item.total
        itemCount++
      }
    }

    const linkedTotal = receipts
      .filter((r) => r.transactionId !== null)
      .reduce((sum, r) => sum + r.total, 0)
    const unlinkedTotal = receipts
      .filter((r) => r.transactionId === null)
      .reduce((sum, r) => sum + r.total, 0)

    res.json({
      receiptCount: receipts.length,
      itemCount,
      total: round(linkedTotal + unlinkedTotal),
      linkedTotal: round(linkedTotal),
      unlinkedTotal: round(unlinkedTotal),
      foodTotal: round(food),
      nonFoodTotal: round(nonFood),
      bySubcategory: [...bySubcategory.entries()]
        .map(([subcategory, total]) => ({ subcategory, total: round(total) }))
        .sort((a, b) => b.total - a.total),
      byCategory: [...byCategory.entries()]
        .map(([category, total]) => ({ category, total: round(total) }))
        .sort((a, b) => b.total - a.total),
    })
  } catch (err: unknown) {
    fail(res, err)
  }
})

// GET /receipts/:id/image — sirve la foto guardada.
router.get('/:id/image', async (req: Request, res: Response) => {
  try {
    const receipt = await prisma.receipt.findUnique({ where: { id: parseInt(req.params.id) } })
    if (!receipt?.imagePath) {
      res.status(404).json({ error: 'Ticket sin imagen' })
      return
    }

    const full = resolveImage(receipt.imagePath)
    if (!full) {
      res.status(404).json({ error: 'Imagen no encontrada' })
      return
    }

    res.type(mediaTypeOf(receipt.imagePath))
    res.sendFile(full)
  } catch (err: unknown) {
    fail(res, err)
  }
})

// GET /receipts/:id/candidates — movimientos que podrían ser este ticket.
router.get('/:id/candidates', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const receipt = await prisma.receipt.findUnique({ where: { id } })
    if (!receipt) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const candidates = await findCandidates(receipt.total, receipt.date, receipt.merchant, {
      excludeReceiptId: id,
    })

    res.json({ candidates })
  } catch (err: unknown) {
    fail(res, err)
  }
})

// PATCH /receipts/:id/link
// Body: { transactionId: number | null }
router.patch('/:id/link', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const { transactionId } = req.body as { transactionId: number | null }

    const receipt = await prisma.receipt.findUnique({ where: { id } })
    if (!receipt) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    if (transactionId !== null) {
      const taken = await prisma.receipt.findUnique({ where: { transactionId } })
      if (taken && taken.id !== id) {
        res.status(409).json({ error: 'Ese movimiento ya tiene otro ticket asociado' })
        return
      }
    }

    const updated = await prisma.receipt.update({
      where: { id },
      data: {
        transactionId,
        matchStatus: transactionId === null ? 'none' : 'manual',
      },
      include: receiptWithItems,
    })

    res.json({ receipt: updated })
  } catch (err: unknown) {
    fail(res, err)
  }
})

// PATCH /receipts/items/:id
// Body: { subcategory, applyToSimilar?: boolean, keyword?: string }
// Corrige la subcategoría de un producto y, si se pide, la recuerda como
// regla para los tickets futuros.
router.patch('/items/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const { subcategory, applyToSimilar, keyword } = req.body as {
      subcategory: string
      applyToSimilar?: boolean
      keyword?: string
    }

    if (!subcategory || !isValidSubcategory(subcategory)) {
      res.status(400).json({ error: `Subcategoría no válida: ${subcategory}` })
      return
    }

    const item = await prisma.receiptItem.findUnique({ where: { id } })
    if (!item) {
      res.status(404).json({ error: 'Producto no encontrado' })
      return
    }

    const updated = await prisma.receiptItem.update({
      where: { id },
      data: { subcategory, manual: true },
    })

    let applied = 1
    if (applyToSimilar) {
      applied += await saveProductRule(keyword?.trim() || item.name, subcategory)
    }

    res.json({ item: updated, applied })
  } catch (err: unknown) {
    fail(res, err)
  }
})

// DELETE /receipts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const receipt = await prisma.receipt.findUnique({ where: { id } })
    if (!receipt) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    // Las líneas caen en cascada (onDelete: Cascade en el esquema).
    await prisma.receipt.delete({ where: { id } })
    if (receipt.imagePath) await deleteImage(receipt.imagePath)

    res.json({ deleted: true })
  } catch (err: unknown) {
    fail(res, err)
  }
})

// GET /receipts/meta/subcategories — claves válidas, para la UI.
router.get('/meta/subcategories', (_req: Request, res: Response) => {
  res.json({ subcategories: SUBCATEGORIES, parents: SUBCATEGORY_PARENT })
})

export default router
