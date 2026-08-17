// Cliente de la API de Gemini y consejos financieros generados con ella.
//
// El modelo recibe un resumen ya agregado del mes (categorías, comercios,
// gastos fijos y comparativa con el mes anterior) — nunca la lista completa
// de movimientos — y devuelve JSON con una forma fija.

import { GoogleGenAI, ApiError } from '@google/genai'
import type { Advice, MonthContext } from './advice'

/** Modelo para los consejos. Multimodal y estable. */
export const ADVICE_MODEL = 'gemini-3.6-flash'

const point = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    detalle: { type: 'string' },
  },
  required: ['titulo', 'detalle'],
} as const

const ADVICE_SCHEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    puntosFuertes: { type: 'array', items: point },
    areasDeMejora: { type: 'array', items: point },
    acciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          accion: { type: 'string' },
          impacto: { type: 'string' },
        },
        required: ['accion', 'impacto'],
      },
    },
  },
  required: ['resumen', 'puntosFuertes', 'areasDeMejora', 'acciones'],
} as const

const SYSTEM_PROMPT = `Eres un analista financiero personal. Analizas los gastos reales de una única persona y le das consejo directo y accionable.

Tono: directo y sin paternalismo. Nada de "¡buen trabajo!" ni de sermones sobre el café. Habla como un amigo que entiende de dinero y no tiene miedo de decir lo que ve.

Reglas:
- Cita siempre cifras concretas en euros y porcentajes tomados de los datos. Nunca generalidades.
- Basa cada afirmación en los datos que recibes. Si algo no está en los datos, no lo afirmes.
- Si la categoría "otros" es una parte grande del gasto, dilo: significa que los movimientos están mal clasificados y el análisis pierde precisión.
- Si solo hay datos de un mes, no inventes tendencias.
- Si hay muy pocos movimientos para sacar conclusiones, dilo con claridad en el resumen en lugar de rellenar.
- 2 o 3 puntos fuertes, 2 o 3 áreas de mejora, y 1 o 2 acciones concretas para el mes que viene.
- Cada acción debe ser algo que se pueda hacer, con una cifra objetivo. "Gastar menos" no vale; "bajar de 53 € a 35 € en HD El Batán reduciendo de 7 a 4 visitas" sí.
- Escribe en español de España. El campo "detalle" son 1 o 2 frases, no un párrafo.`

function userPrompt(context: MonthContext): string {
  return `Estos son mis datos financieros. Todas las cifras están en euros.

${JSON.stringify(context, null, 2)}

Notas sobre los datos:
- "porCategoria" y "principalesComercios" solo incluyen gastos, no ingresos.
- "principalesComercios" son los 12 comercios con más gasto, agrupados por el concepto bancario.
- "gastosFijos" son los gastos recurrentes que he registrado a mano; pueden solaparse con los movimientos reales.
- "mesAnterior" es null si no hay movimientos del mes anterior.
- "cuenta" indica de qué cuenta bancaria son estos datos. Si tiene valor, analiza solo esa cuenta y menciónala; ten en cuenta que no ves el resto de mi dinero y que "gastosFijos" llega vacío porque no está repartido por cuenta. Si es null, son todas mis cuentas juntas.
- Los traspasos entre mis propias cuentas están excluidos: ni gasto ni ingreso.

Analiza y responde.`
}

export class GeminiConfigError extends Error {}

/** El modelo no devolvió contenido: filtro de seguridad, o respuesta vacía. */
export class GeminiEmptyError extends Error {}

/** Error de la API ya traducido a algo que se pueda enseñar en pantalla. */
export class GeminiApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** Convierte los errores del SDK en mensajes accionables en español. */
export function translateApiError(err: unknown): GeminiApiError {
  if (err instanceof ApiError) {
    const detail = typeof err.message === 'string' ? err.message : ''

    // Gemini devuelve 400 INVALID_ARGUMENT cuando la clave no vale, no un 401.
    if (err.status === 401 || err.status === 403 || /api[ _]key/i.test(detail)) {
      return new GeminiApiError(
        'La GEMINI_API_KEY no es válida o no tiene permisos — revísala en aistudio.google.com/apikey',
        503
      )
    }

    if (err.status === 429) {
      return new GeminiApiError(
        'Has alcanzado el límite de peticiones de Gemini — prueba dentro de un minuto',
        429
      )
    }

    if (/quota|billing/i.test(detail)) {
      return new GeminiApiError(
        'Tu proyecto de Google ha agotado la cuota. Revisa el plan en aistudio.google.com, o usa el análisis local',
        402
      )
    }

    return new GeminiApiError(`Error de la API de Gemini (${err.status}): ${detail}`, 502)
  }

  const message = err instanceof Error ? err.message : 'Error desconocido'
  return new GeminiApiError(`No se pudo contactar con la API de Gemini: ${message}`, 502)
}

export function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey || apiKey.startsWith('your_')) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY no está configurada en backend/.env — usa el análisis local'
    )
  }

  return new GoogleGenAI({ apiKey })
}

/**
 * Pide una respuesta JSON que cumpla `schema`.
 * `input` es texto suelto o una lista de bloques (texto + imagen).
 */
export async function generateJson<T>(options: {
  model: string
  systemPrompt: string
  input: Parameters<GoogleGenAI['interactions']['create']>[0]['input']
  schema: Record<string, unknown>
}): Promise<{ data: T; model: string }> {
  const client = getClient()

  let interaction
  try {
    interaction = await client.interactions.create({
      model: options.model,
      system_instruction: options.systemPrompt,
      input: options.input,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: options.schema,
      },
    })
  } catch (err: unknown) {
    throw translateApiError(err)
  }

  const text = interaction.output_text?.trim()
  if (!text) {
    throw new GeminiEmptyError(
      'El modelo no devolvió nada. Puede que haya bloqueado la petición o que la imagen no se entienda.'
    )
  }

  return { data: JSON.parse(text) as T, model: interaction.model ?? options.model }
}

// ── Conversación con herramientas ──────────────────────────────
//
// El chat necesita algo que `generateJson` no da: varios turnos de historia,
// respuesta en prosa y la posibilidad de que el modelo pida datos. Los tipos
// de abajo son la forma exacta que espera la API para cada paso.

/** La respuesta de `interactions.create` cuando no se pide streaming. */
type InteractionResult = Extract<
  Awaited<ReturnType<GoogleGenAI['interactions']['create']>>,
  { steps: unknown }
>

/**
 * Un paso de la conversación, en la forma exacta que la API espera y devuelve:
 * lo dicho por cada parte, lo que el modelo pide ejecutar y lo que le
 * contestamos. El tipo se saca del propio SDK porque los pasos que devuelve el
 * modelo se le reenvían tal cual, sin reconstruirlos.
 */
export type ChatStep = InteractionResult['steps'][number]

/** Declaración de una herramienta que el modelo puede pedir que ejecutemos. */
export interface ChatTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ChatTurn {
  /** Respuesta en prosa. Vacía si el modelo solo ha pedido herramientas. */
  text: string
  /** Lo que quiere ejecutar antes de poder responder. */
  calls: ChatCall[]
  /**
   * Los pasos que ha devuelto, para encadenarlos en la vuelta siguiente.
   * Van tal cual y sin filtrar: entre ellos viaja el razonamiento firmado, y
   * si la llamada se reconstruye a mano (o se pierde la firma) la API rechaza
   * la petición entera con un 400.
   */
  steps: ChatStep[]
  model: string
}

/**
 * Una vuelta de conversación. A propósito no cierra el bucle de herramientas:
 * devuelve lo que pide el modelo y deja que quien llama decida si lo ejecuta
 * (lo hace `chat.ts`, que es quien sabe leer la base de datos).
 */
export async function generateChatTurn(options: {
  model: string
  systemPrompt: string
  steps: ChatStep[]
  /** Sin herramientas, el modelo se ve obligado a responder con lo que tiene. */
  tools?: ChatTool[]
}): Promise<ChatTurn> {
  const client = getClient()

  let interaction
  try {
    interaction = await client.interactions.create({
      model: options.model,
      system_instruction: options.systemPrompt,
      input: options.steps,
      tools: options.tools,
    })
  } catch (err: unknown) {
    throw translateApiError(err)
  }

  // La respuesta trae solo los pasos nuevos, pero por si acaso las llamadas
  // ya ejecutadas se descartan por id: repetirlas sería consultar dos veces.
  const alreadySent = new Set(
    options.steps.flatMap((step) =>
      'type' in step && step.type === 'function_call' ? [step.id] : []
    )
  )

  const steps = interaction.steps ?? []
  const calls: ChatCall[] = []
  for (const step of steps) {
    if (step.type === 'function_call' && !alreadySent.has(step.id)) {
      calls.push({ id: step.id, name: step.name, arguments: step.arguments ?? {} })
    }
  }

  return {
    text: interaction.output_text?.trim() ?? '',
    calls,
    steps,
    model: interaction.model ?? options.model,
  }
}

export async function generateAdvice(
  context: MonthContext
): Promise<{ advice: Advice; model: string }> {
  const { data, model } = await generateJson<Advice>({
    model: ADVICE_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    input: userPrompt(context),
    schema: ADVICE_SCHEMA,
  })

  return { advice: data, model }
}
