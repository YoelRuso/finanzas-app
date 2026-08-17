// Herramientas que el modelo puede pedir durante el chat.
//
// El chat arranca con el resumen del mes que se está viendo ya metido en el
// prompt, pero eso es un solo mes agregado. Todo lo demás — un comercio
// concreto, otro periodo, lo que hay dentro de un ticket — lo pide con estas
// funciones, que son las únicas que tocan la base de datos desde el chat.
//
// Devuelven siempre JSON en texto, que es lo que la API espera como resultado
// de una herramienta.

import prisma from '../db/client'
import { buildMonthContext, round } from './advice'
import { CATEGORIES, merchantKey } from './categorizer'
import { SUBCATEGORIES } from './subcategories'
import type { ChatTool } from './gemini'

/** Movimientos que se leen como mucho en una búsqueda. */
const SEARCH_LIMIT = 500

/** Movimientos que se le enseñan al modelo uno a uno. */
const DETAIL_LIMIT = 25

/** Comercios distintos que se le enseñan en el resumen de una búsqueda. */
const MERCHANT_LIMIT = 12

/** Productos distintos que devuelve la búsqueda en tickets. */
const PRODUCT_LIMIT = 30

const MONTH_PATTERN = /^\d{4}-\d{2}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const CHAT_TOOLS: ChatTool[] = [
  {
    type: 'function',
    name: 'buscar_movimientos',
    description:
      'Busca movimientos bancarios reales por concepto, fechas y categoría. Úsala cuando la pregunta sea sobre un comercio concreto ("cuánto gasto en Mercadona"), sobre un periodo distinto del mes que se está viendo, o cuando necesites ver los movimientos uno a uno. Devuelve el total, cuántos son, los mayores y el desglose por comercio.',
    parameters: {
      type: 'object',
      properties: {
        texto: {
          type: 'string',
          description:
            'Texto que debe aparecer en el concepto del movimiento, por ejemplo "mercadona". Omite este campo para no filtrar por concepto.',
        },
        desde: {
          type: 'string',
          description: 'Fecha inicial incluida, formato YYYY-MM-DD. Omítela para no limitar por abajo.',
        },
        hasta: {
          type: 'string',
          description: 'Fecha final incluida, formato YYYY-MM-DD. Omítela para no limitar por arriba.',
        },
        categoria: {
          type: 'string',
          enum: [...CATEGORIES],
          description: 'Limita la búsqueda a una categoría. Omítela para buscar en todas.',
        },
        tipo: {
          type: 'string',
          enum: ['gasto', 'ingreso', 'todos'],
          description: 'Qué movimientos contar. Por defecto "gasto".',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'resumen_mes',
    description:
      'Devuelve el resumen completo de un mes: ingresos, gastos, balance, desglose por categoría, principales comercios y comparativa con el mes anterior. Úsala para hablar de un mes distinto del que se está viendo, o para comparar varios meses (una llamada por mes).',
    parameters: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'Mes en formato YYYY-MM, por ejemplo "2026-07".' },
      },
      required: ['mes'],
    },
  },
  {
    type: 'function',
    name: 'buscar_productos',
    description:
      'Busca productos concretos dentro de los tickets de compra fotografiados. Es la única forma de saber qué se compró de verdad: el movimiento del banco solo dice "MERCADONA 56,95". Úsala para preguntas sobre la cesta ("cuánto me gasto en cerveza", "qué compro más en el súper").',
    parameters: {
      type: 'object',
      properties: {
        texto: {
          type: 'string',
          description:
            'Texto que debe aparecer en el nombre del producto, por ejemplo "leche". Omítelo para no filtrar por nombre.',
        },
        subcategoria: {
          type: 'string',
          enum: [...SUBCATEGORIES],
          description: 'Limita la búsqueda a una subcategoría de producto. Omítela para buscar en todas.',
        },
        desde: { type: 'string', description: 'Fecha inicial incluida, YYYY-MM-DD. Opcional.' },
        hasta: { type: 'string', description: 'Fecha final incluida, YYYY-MM-DD. Opcional.' },
      },
      required: [],
    },
  },
]

/** Lo que sabe el chat del sitio desde el que se pregunta. */
export interface ToolContext {
  /** Cuenta que se está viendo. Sin ella, las búsquedas abarcan todas. */
  accountId?: string
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Un "2026-07-31" se interpreta como medianoche UTC y dejaría fuera los
 * movimientos de ese mismo día. Mismo criterio que en la ruta de movimientos.
 */
function endOfDay(date: string): Date {
  const parsed = new Date(date)
  if (DATE_PATTERN.test(date)) parsed.setUTCHours(23, 59, 59, 999)
  return parsed
}

function dateFilter(desde?: string, hasta?: string) {
  if (!desde && !hasta) return {}
  return {
    date: {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: endOfDay(hasta) } : {}),
    },
  }
}

async function buscarMovimientos(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const texto = text(args.texto)
  const categoria = text(args.categoria)
  const tipo = text(args.tipo) ?? 'gasto'

  const transactions = await prisma.transaction.findMany({
    where: {
      // Un traspaso entre cuentas propias no es gasto: contarlo daría cifras
      // infladas justo en las preguntas de "cuánto me he gastado".
      isTransfer: false,
      ...(ctx.accountId ? { accountId: ctx.accountId } : {}),
      // En SQLite `contains` se traduce a LIKE, que ya ignora mayúsculas para
      // ASCII: los conceptos del banco vienen en mayúsculas y casan igual.
      ...(texto ? { description: { contains: texto } } : {}),
      ...(categoria ? { category: categoria } : {}),
      ...(tipo === 'gasto' ? { amount: { lt: 0 } } : {}),
      ...(tipo === 'ingreso' ? { amount: { gt: 0 } } : {}),
      ...dateFilter(text(args.desde), text(args.hasta)),
    },
    select: { date: true, description: true, amount: true, category: true },
    orderBy: { date: 'desc' },
    take: SEARCH_LIMIT,
  })

  if (transactions.length === 0) {
    return { encontrados: 0, aviso: 'No hay ningún movimiento que cumpla esa búsqueda.' }
  }

  let total = 0
  const porComercio = new Map<string, { veces: number; total: number }>()

  for (const tx of transactions) {
    const importe = Math.abs(tx.amount)
    total += importe

    const comercio = merchantKey(tx.description)
    const acumulado = porComercio.get(comercio) ?? { veces: 0, total: 0 }
    acumulado.veces++
    acumulado.total += importe
    porComercio.set(comercio, acumulado)
  }

  return {
    encontrados: transactions.length,
    truncado: transactions.length === SEARCH_LIMIT,
    total: round(total),
    media: round(total / transactions.length),
    porComercio: Array.from(porComercio.entries())
      .map(([comercio, v]) => ({ comercio, veces: v.veces, total: round(v.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, MERCHANT_LIMIT),
    movimientos: transactions.slice(0, DETAIL_LIMIT).map((tx) => ({
      fecha: tx.date.toISOString().slice(0, 10),
      concepto: tx.description,
      importe: round(tx.amount),
      categoria: tx.category ?? 'otros',
    })),
  }
}

async function resumenMes(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const mes = text(args.mes)
  if (!mes || !MONTH_PATTERN.test(mes)) {
    return { error: 'El mes debe tener el formato YYYY-MM.' }
  }
  return buildMonthContext(mes, ctx.accountId)
}

async function buscarProductos(args: Record<string, unknown>): Promise<unknown> {
  const texto = text(args.texto)
  const subcategoria = text(args.subcategoria)

  const items = await prisma.receiptItem.findMany({
    where: {
      ...(texto ? { name: { contains: texto } } : {}),
      ...(subcategoria ? { subcategory: subcategoria } : {}),
      receipt: dateFilter(text(args.desde), text(args.hasta)),
    },
    select: {
      name: true,
      quantity: true,
      total: true,
      subcategory: true,
      receipt: { select: { date: true, merchant: true } },
    },
    orderBy: { id: 'desc' },
    take: SEARCH_LIMIT,
  })

  if (items.length === 0) {
    return {
      encontrados: 0,
      aviso:
        'No hay productos así en los tickets escaneados. Puede que la compra exista pero no se haya fotografiado el ticket.',
    }
  }

  // Los tickets repiten el mismo producto semana a semana; agrupar por nombre
  // es lo que convierte 40 líneas sueltas en "leche: 12 veces, 14,28 €".
  const porProducto = new Map<string, { veces: number; total: number; subcategoria: string }>()
  let total = 0

  for (const item of items) {
    total += item.total
    const clave = item.name.toLowerCase()
    const acumulado = porProducto.get(clave) ?? {
      veces: 0,
      total: 0,
      subcategoria: item.subcategory,
    }
    acumulado.veces++
    acumulado.total += item.total
    porProducto.set(clave, acumulado)
  }

  const fechas = items.map((i) => i.receipt.date.toISOString().slice(0, 10)).sort()

  return {
    encontrados: items.length,
    truncado: items.length === SEARCH_LIMIT,
    total: round(total),
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
    productos: Array.from(porProducto.entries())
      .map(([nombre, v]) => ({
        nombre,
        veces: v.veces,
        total: round(v.total),
        subcategoria: v.subcategoria,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, PRODUCT_LIMIT),
  }
}

/**
 * Ejecuta la herramienta que ha pedido el modelo y devuelve el resultado ya
 * serializado. Los errores se devuelven como dato en vez de lanzarse: el
 * modelo puede corregir el tiro y volver a intentarlo, y una excepción aquí
 * tiraría abajo la respuesta entera.
 */
export async function runChatTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case 'buscar_movimientos':
        return JSON.stringify(await buscarMovimientos(args, ctx))
      case 'resumen_mes':
        return JSON.stringify(await resumenMes(args, ctx))
      case 'buscar_productos':
        return JSON.stringify(await buscarProductos(args))
      default:
        return JSON.stringify({ error: `No existe ninguna herramienta llamada "${name}".` })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return JSON.stringify({ error: `La consulta ha fallado: ${message}` })
  }
}
