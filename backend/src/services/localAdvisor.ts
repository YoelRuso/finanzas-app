// Motor de consejos por reglas — sin IA, sin coste, instantáneo.
//
// Produce exactamente la misma forma que el motor de Claude, así que la UI
// no distingue entre uno y otro. Cada observación se construye a partir de
// una cifra concreta del mes; si el dato no está, la observación no se emite.

import {
  monthName,
  round,
  type Advice,
  type AdviceAction,
  type AdvicePoint,
  type MonthContext,
} from './advice'

const CATEGORY_LABELS: Record<string, string> = {
  alimentacion: 'alimentación',
  transporte: 'transporte',
  suscripciones: 'suscripciones',
  salud: 'salud',
  ocio: 'ocio',
  vivienda: 'vivienda',
  compras: 'compras',
  deporte: 'deporte',
  educacion: 'educación',
  ingresos: 'ingresos',
  transferencias: 'transferencias',
  otros: 'otros',
}

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

function label(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

/** Capitaliza para empezar frase. */
function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Candidato con peso: los de mayor `score` (en euros) llegan al resultado. */
interface Scored<T> {
  score: number
  value: T
}

function pick<T>(candidates: Scored<T>[], limit: number): T[] {
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => c.value)
}

// Un traspaso o un Bizum no es un comercio del que se pueda "recortar":
// mover dinero entre cuentas o pagar a una persona no es gasto discrecional.
const NO_RECORTABLES = new Set(['transferencias'])

/** Comercios sobre los que tiene sentido sugerir un recorte. */
function comerciosRecortables(context: MonthContext) {
  return context.principalesComercios.filter((m) => !NO_RECORTABLES.has(m.categoria))
}

/**
 * Una categoría cubierta casi por completo por gastos fijos registrados
 * (el gimnasio, el alquiler) no admite "recorta un 10%": el importe no
 * depende del comportamiento del mes.
 */
function esCategoriaFija(context: MonthContext, categoria: string, total: number): boolean {
  if (total <= 0) return false
  const fijo = context.gastosFijos
    .filter((g) => g.categoria === categoria)
    .reduce((s, g) => s + g.importe, 0)
  return fijo / total >= 0.7
}

/** Variación por categoría respecto al mes anterior. */
function categoryDeltas(context: MonthContext): { categoria: string; actual: number; anterior: number; delta: number }[] {
  if (!context.mesAnterior) return []

  const anterior = new Map(context.mesAnterior.porCategoria.map((c) => [c.categoria, c.total]))
  const categorias = new Set([
    ...context.porCategoria.map((c) => c.categoria),
    ...context.mesAnterior.porCategoria.map((c) => c.categoria),
  ])

  return Array.from(categorias).map((categoria) => {
    const actual = context.porCategoria.find((c) => c.categoria === categoria)?.total ?? 0
    const previo = anterior.get(categoria) ?? 0
    return { categoria, actual, anterior: previo, delta: round(actual - previo) }
  })
}

function buildResumen(context: MonthContext): string {
  const mes = monthName(context.mes)
  const partes: string[] = []

  if (context.movimientosGasto === 0) {
    return `No hay ningún gasto registrado en ${mes}, así que no hay nada que analizar.`
  }

  if (context.movimientosGasto < 5) {
    partes.push(
      `Solo hay ${context.movimientosGasto} gastos registrados en ${mes}: son muy pocos para sacar conclusiones sólidas.`
    )
  }

  partes.push(
    `Gastaste ${eur.format(context.gastos)} en ${mes} repartidos en ${context.movimientosGasto} movimientos.`
  )

  const prev = context.mesAnterior
  if (prev && prev.gastos > 0) {
    const delta = round(context.gastos - prev.gastos)
    const variacion = pct(Math.abs(delta), prev.gastos)
    if (delta > 0) {
      partes.push(
        `Son ${eur.format(delta)} más que en ${monthName(prev.mes)} (${eur.format(prev.gastos)}), un ${variacion}% por encima.`
      )
    } else if (delta < 0) {
      partes.push(
        `Son ${eur.format(-delta)} menos que en ${monthName(prev.mes)} (${eur.format(prev.gastos)}), un ${variacion}% por debajo.`
      )
    } else {
      partes.push(`Exactamente lo mismo que en ${monthName(prev.mes)}.`)
    }
  } else {
    partes.push('No hay movimientos del mes anterior con los que comparar.')
  }

  if (context.ingresos > 0) {
    partes.push(
      context.balance >= 0
        ? `Ingresaste ${eur.format(context.ingresos)}, así que te quedaron ${eur.format(context.balance)} (${pct(context.balance, context.ingresos)}% de lo que entró).`
        : `Ingresaste ${eur.format(context.ingresos)}, así que te pasaste ${eur.format(-context.balance)}.`
    )
  } else {
    partes.push('No hay ingresos registrados este mes, así que no se puede calcular tasa de ahorro.')
  }

  return partes.join(' ')
}

function buildFortalezas(context: MonthContext): AdvicePoint[] {
  const candidatos: Scored<AdvicePoint>[] = []
  const prev = context.mesAnterior
  const otros = context.porCategoria.find((c) => c.categoria === 'otros')?.total ?? 0

  if (context.balance > 0 && context.ingresos > 0) {
    candidatos.push({
      score: context.balance,
      value: {
        titulo: 'Cerraste el mes en positivo',
        detalle: `Entraron ${eur.format(context.ingresos)} y salieron ${eur.format(context.gastos)}: te quedaron ${eur.format(context.balance)}, un ${pct(context.balance, context.ingresos)}% de tus ingresos.`,
      },
    })
  }

  if (prev && prev.gastos > 0 && context.gastos < prev.gastos) {
    const ahorro = round(prev.gastos - context.gastos)
    candidatos.push({
      score: ahorro,
      value: {
        titulo: `Gastaste menos que en ${monthName(prev.mes)}`,
        detalle: `${eur.format(ahorro)} menos, un ${pct(ahorro, prev.gastos)}% por debajo del mes anterior.`,
      },
    })
  }

  const bajadas = categoryDeltas(context).filter((d) => d.delta < 0 && d.anterior > 0)
  const mayorBajada = bajadas.sort((a, b) => a.delta - b.delta)[0]
  if (mayorBajada) {
    candidatos.push({
      score: Math.abs(mayorBajada.delta),
      value: {
        titulo: `Bajaste el gasto en ${label(mayorBajada.categoria)}`,
        detalle: `De ${eur.format(mayorBajada.anterior)} a ${eur.format(mayorBajada.actual)}: ${eur.format(Math.abs(mayorBajada.delta))} menos que en ${monthName(prev!.mes)}.`,
      },
    })
  }

  if (context.gastos > 0 && pct(otros, context.gastos) < 10) {
    candidatos.push({
      score: context.gastos * 0.15,
      value: {
        titulo: 'Tus movimientos están bien clasificados',
        detalle: `Solo ${eur.format(otros)} (${pct(otros, context.gastos)}%) siguen sin categorizar, así que estas cifras son fiables.`,
      },
    })
  }

  if (context.ingresos > 0 && context.totalGastosFijos > 0) {
    const ratio = pct(context.totalGastosFijos, context.ingresos)
    if (ratio < 35) {
      candidatos.push({
        score: context.ingresos * 0.2,
        value: {
          titulo: 'Gastos fijos contenidos',
          detalle: `Tus ${eur.format(context.totalGastosFijos)} de gastos fijos son el ${ratio}% de lo que ingresas, así que te queda margen de maniobra.`,
        },
      })
    }
  }

  return pick(candidatos, 3)
}

function buildMejoras(context: MonthContext): AdvicePoint[] {
  const candidatos: Scored<AdvicePoint>[] = []
  const prev = context.mesAnterior
  const otros = context.porCategoria.find((c) => c.categoria === 'otros')?.total ?? 0
  const otrosPct = pct(otros, context.gastos)

  if (context.balance < 0 && context.ingresos > 0) {
    candidatos.push({
      // Se dobla el peso: gastar más de lo que entra manda sobre todo lo demás.
      score: Math.abs(context.balance) * 2,
      value: {
        titulo: 'Gastaste más de lo que ingresaste',
        detalle: `Te pasaste ${eur.format(-context.balance)} sobre los ${eur.format(context.ingresos)} que entraron. Ese hueco sale de tus ahorros.`,
      },
    })
  }

  if (otrosPct >= 20) {
    candidatos.push({
      score: otros,
      value: {
        titulo: 'Demasiado gasto sin clasificar',
        detalle: `${eur.format(otros)} (${otrosPct}% del total) están en «Otros», repartidos en ${context.movimientosSinClasificar} movimientos. Hasta que los clasifiques, el resto del análisis va a medias.`,
      },
    })
  }

  const subidas = categoryDeltas(context).filter((d) => d.delta > 0 && d.categoria !== 'otros')
  const mayorSubida = subidas.sort((a, b) => b.delta - a.delta)[0]
  if (mayorSubida && prev) {
    const detalle =
      mayorSubida.anterior > 0
        ? `De ${eur.format(mayorSubida.anterior)} en ${monthName(prev.mes)} a ${eur.format(mayorSubida.actual)} este mes: ${eur.format(mayorSubida.delta)} más (+${pct(mayorSubida.delta, mayorSubida.anterior)}%).`
        : `${eur.format(mayorSubida.actual)} este mes, cuando en ${monthName(prev.mes)} no gastaste nada en esta categoría.`
    candidatos.push({
      score: mayorSubida.delta,
      value: { titulo: `El gasto en ${label(mayorSubida.categoria)} ha subido`, detalle },
    })
  }

  // Se exigen 2+ cargos: un cobro único (una cuota, una compra puntual) no es
  // un patrón de consumo, y señalarlo como tal lleva a consejos inútiles.
  const top = comerciosRecortables(context)[0]
  if (top && top.veces >= 2 && context.gastos > 0 && pct(top.total, context.gastos) >= 12) {
    candidatos.push({
      score: top.total * 0.8,
      value: {
        titulo: `${cap(top.comercio)} concentra buena parte del gasto`,
        detalle: `${top.veces} ${top.veces === 1 ? 'compra' : 'compras'} por ${eur.format(top.total)}: el ${pct(top.total, context.gastos)}% de todo lo que gastaste este mes.`,
      },
    })
  }

  if (context.ingresos > 0 && context.totalGastosFijos > 0) {
    const ratio = pct(context.totalGastosFijos, context.ingresos)
    if (ratio >= 50) {
      candidatos.push({
        score: context.totalGastosFijos * 1.5,
        value: {
          titulo: 'Los gastos fijos se comen tus ingresos',
          detalle: `${eur.format(context.totalGastosFijos)} de gastos fijos sobre ${eur.format(context.ingresos)} de ingresos: el ${ratio}%. Antes de recortar caprichos, mira si alguno de estos se puede bajar.`,
        },
      })
    }
  }

  return pick(candidatos, 3)
}

function buildAcciones(context: MonthContext): AdviceAction[] {
  const candidatos: Scored<AdviceAction>[] = []
  const prev = context.mesAnterior
  const otros = context.porCategoria.find((c) => c.categoria === 'otros')?.total ?? 0
  // Categorías que ya tienen una acción, para no repetir consejo sobre la misma.
  const cubiertas = new Set<string>()

  if (pct(otros, context.gastos) >= 15 && context.movimientosSinClasificar > 0) {
    candidatos.push({
      score: otros,
      value: {
        accion: `Clasifica los ${context.movimientosSinClasificar} movimientos que siguen en «Otros» desde la sección Sin clasificar`,
        impacto: `${eur.format(otros)} pasarán de ser un agujero a datos que puedes analizar`,
      },
    })
  }

  const subidas = categoryDeltas(context).filter(
    (d) => d.delta > 0 && d.anterior > 0 && d.categoria !== 'otros'
  )
  const mayorSubida = subidas.sort((a, b) => b.delta - a.delta)[0]
  if (mayorSubida && prev && !esCategoriaFija(context, mayorSubida.categoria, mayorSubida.actual)) {
    cubiertas.add(mayorSubida.categoria)
    candidatos.push({
      score: mayorSubida.delta,
      value: {
        accion: `Vuelve al nivel de ${monthName(prev.mes)} en ${label(mayorSubida.categoria)}: bajar de ${eur.format(mayorSubida.actual)} a ${eur.format(mayorSubida.anterior)}`,
        impacto: `Ahorro de ${eur.format(mayorSubida.delta)} al mes`,
      },
    })
  }

  const top = comerciosRecortables(context)[0]
  if (top && top.veces >= 3) {
    const objetivo = Math.max(1, Math.ceil(top.veces * 0.6))
    const porVisita = top.total / top.veces
    const ahorro = round(porVisita * (top.veces - objetivo))
    if (ahorro > 0) {
      candidatos.push({
        score: ahorro,
        value: {
          accion: `Baja de ${top.veces} a ${objetivo} compras en ${cap(top.comercio)} (unos ${eur.format(porVisita)} cada una)`,
          impacto: `Ahorro estimado de ${eur.format(ahorro)} al mes`,
        },
      })
    }
  }

  if (context.balance < 0 && context.ingresos > 0) {
    candidatos.push({
      score: Math.abs(context.balance) * 2,
      value: {
        accion: `Recorta ${eur.format(-context.balance)} de gasto para cerrar el mes que viene en positivo`,
        impacto: `Dejarías de tirar de ahorros`,
      },
    })
  }

  // Red de seguridad: si nada de lo anterior aplica (mes tranquilo, todo
  // clasificado, sin subidas), al menos se propone un tope sobre la categoría
  // que más pesa. Peso bajo para que solo aparezca cuando no hay nada mejor.
  const mayorCategoria = context.porCategoria.filter(
    (c) =>
      !NO_RECORTABLES.has(c.categoria) &&
      c.categoria !== 'otros' &&
      !cubiertas.has(c.categoria) &&
      !esCategoriaFija(context, c.categoria, c.total)
  )[0]
  if (mayorCategoria && mayorCategoria.total > 0) {
    const objetivo = round(mayorCategoria.total * 0.9)
    candidatos.push({
      score: mayorCategoria.total * 0.05,
      value: {
        accion: `Ponte un tope de ${eur.format(objetivo)} en ${label(mayorCategoria.categoria)}, tu mayor gasto variable del mes (${eur.format(mayorCategoria.total)})`,
        impacto: `Ahorro de ${eur.format(round(mayorCategoria.total - objetivo))} al mes con un recorte del 10%`,
      },
    })
  }

  return pick(candidatos, 2)
}

/** Genera el consejo completo a partir de los datos del mes. */
export function generateLocalAdvice(context: MonthContext): Advice {
  if (context.movimientosGasto === 0) {
    return {
      resumen: buildResumen(context),
      puntosFuertes: [],
      areasDeMejora: [],
      acciones: [],
    }
  }

  return {
    resumen: buildResumen(context),
    puntosFuertes: buildFortalezas(context),
    areasDeMejora: buildMejoras(context),
    acciones: buildAcciones(context),
  }
}
