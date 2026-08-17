// Propuesta de categoría para los comercios que quedaron en «otros».
//
// El categorizador por reglas solo acierta con los comercios conocidos
// (Mercadona, Netflix…). Todo lo demás cae en «otros» y hay que clasificarlo
// a mano, comercio a comercio. Aquí se le pasan todos los pendientes a Gemini
// de una vez y devuelve una propuesta para cada uno; el usuario confirma o
// corrige en pantalla, y esa confirmación es la que crea la CategoryRule.
//
// La IA nunca escribe en la base de datos: solo propone.

import { generateJson } from './gemini'
import { CATEGORIES, isValidCategory } from './categorizer'

export const SUGGEST_MODEL = 'gemini-3.6-flash'

/** Tope por llamada: con más, el prompt se dispara y la respuesta se degrada. */
export const MAX_GROUPS = 80

export interface PendingGroup {
  /** Clave del comercio, tal y como la agrupa `merchantKey`. */
  key: string
  /** Un concepto bancario de ejemplo, sin recortar. */
  sample: string
  count: number
  total: number
}

export interface CategorySuggestion {
  key: string
  category: string
}

interface RawSuggestion {
  comercio: string
  categoria: string
}

interface RawResponse {
  sugerencias: RawSuggestion[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    sugerencias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          comercio: {
            type: 'string',
            description: 'La clave exacta del comercio, copiada tal cual de la lista',
          },
          categoria: {
            type: 'string',
            enum: [...CATEGORIES],
            description: 'La categoría que le corresponde',
          },
        },
        required: ['comercio', 'categoria'],
      },
    },
  },
  required: ['sugerencias'],
} as const

/*
 * La guía repite el criterio de las reglas por defecto del categorizador
 * (RULES en categorizer.ts): si la IA clasificara los restaurantes como
 * alimentación, las sugerencias contradirían a lo que ya está clasificado.
 */
const SYSTEM_PROMPT = `Clasificas comercios de movimientos bancarios españoles en categorías de gasto.

Categorías y qué va en cada una:
- alimentacion: supermercados, fruterías, panaderías, carnicerías, pescaderías. La compra del súper.
- ocio: restaurantes, bares, cafeterías, comida a domicilio, cines, conciertos, videojuegos, ocio en general.
- transporte: gasolineras, parking, taxis, VTC, transporte público, billetes, talleres y seguros del coche.
- suscripciones: cuotas recurrentes de servicios digitales (streaming, música, nube, software).
- salud: farmacias, médicos, dentistas, ópticas, seguros de salud.
- vivienda: alquiler, hipoteca, luz, agua, gas, internet de casa, comunidad, seguros del hogar.
- compras: ropa, electrónica, muebles, bazar, regalos, comercio online que no sea comida.
- deporte: gimnasios, clubes, material deportivo, pistas.
- educacion: matrículas, academias, cursos, libros de texto.
- transferencias: Bizum, transferencias y envíos de dinero a personas.
- ingresos: nóminas, devoluciones y cualquier cosa que sea dinero que entra.
- otros: solo cuando de verdad no se pueda saber qué es.

Reglas:
- Devuelve exactamente una sugerencia por comercio de la lista, ni una más.
- Copia el campo "comercio" tal cual te llega, sin cambiar mayúsculas ni acortarlo. Es la clave con la que se casa tu respuesta.
- Los nombres vienen recortados y en mayúsculas del extracto bancario ("HD EL BATAN", "SD SAGASTA"). Reconoce cadenas españolas y nombres de negocio locales por lo que sugieren.
- Un comercio ambiguo con importes pequeños y repetidos suele ser comida o bar; uno con un único importe grande, una compra.
- No inventes: si el nombre no da ninguna pista, pon "otros".`

function userPrompt(groups: PendingGroup[]): string {
  const list = groups.map((g) => ({
    comercio: g.key,
    concepto: g.sample,
    veces: g.count,
    total: g.total,
  }))

  return `Estos son los comercios sin clasificar, con el concepto bancario completo, cuántas veces aparecen y el total gastado en euros.

${JSON.stringify(list, null, 1)}

Clasifícalos todos.`
}

/**
 * Pide una categoría para cada comercio. Descarta lo que no case con la
 * lista que se envió: el modelo puede devolver claves inventadas o repetidas.
 */
export async function suggestCategories(
  groups: PendingGroup[]
): Promise<{ suggestions: CategorySuggestion[]; model: string }> {
  const batch = groups.slice(0, MAX_GROUPS)
  if (batch.length === 0) return { suggestions: [], model: SUGGEST_MODEL }

  const { data, model } = await generateJson<RawResponse>({
    model: SUGGEST_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    input: userPrompt(batch),
    schema: SCHEMA as unknown as Record<string, unknown>,
  })

  const wanted = new Set(batch.map((g) => g.key))
  const seen = new Set<string>()
  const suggestions: CategorySuggestion[] = []

  for (const raw of data.sugerencias ?? []) {
    const key = raw.comercio?.trim()
    if (!key || !wanted.has(key) || seen.has(key)) continue
    if (!isValidCategory(raw.categoria)) continue
    // Proponer «otros» es no proponer nada: ese es el estado del que venimos.
    if (raw.categoria === 'otros') continue

    seen.add(key)
    suggestions.push({ key, category: raw.categoria })
  }

  return { suggestions, model }
}
