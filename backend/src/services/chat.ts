// Chat sobre los datos financieros propios.
//
// A diferencia de los consejos, que son una única llamada con un resumen ya
// masticado, aquí el modelo puede pedir datos: arranca con el resumen del mes
// que se está viendo y tira de las herramientas de `chatTools.ts` para lo que
// no esté ahí. Este fichero es quien cierra ese bucle.

import { generateChatTurn, type ChatStep } from './gemini'
import { CHAT_TOOLS, runChatTool, type ToolContext } from './chatTools'
import { monthName, type MonthContext } from './advice'

export const CHAT_MODEL = 'gemini-3.6-flash'

/**
 * Vueltas de herramientas antes de obligar al modelo a responder. Cuatro dan
 * de sobra para comparar un par de meses; más es que se ha atascado, y cada
 * vuelta es una llamada que se paga.
 */
const MAX_TOOL_ROUNDS = 4

/** Mensajes de historia que viajan en cada pregunta (5 turnos). */
export const HISTORY_LIMIT = 10

const SYSTEM_PROMPT = `Eres el analista financiero personal de quien te habla. Conoces sus gastos reales y respondes preguntas sobre ellos.

Tono: directo y sin paternalismo. Nada de "¡buen trabajo!" ni de sermones sobre el café. Hablas como un amigo que entiende de dinero y no tiene miedo de decir lo que ve.

Reglas:
- Responde corto: de una a cinco frases. Es una conversación, no un informe.
- Cita siempre cifras concretas en euros tomadas de los datos. Nunca generalidades.
- No inventes nada. Si un dato no está en el contexto, pídelo con una herramienta; si tampoco aparece ahí, di que no lo sabes.
- El contexto que recibes es solo del mes y la cuenta que se están viendo ahora mismo. Para cualquier otro mes, comercio o periodo, usa las herramientas.
- Usa "buscar_productos" cuando pregunten por lo que hay dentro de la compra (marcas, alimentos concretos): el movimiento del banco solo dice el total del súper.
- Los traspasos entre cuentas propias no son gasto ni ingreso, y están excluidos de todas las cifras.
- Si la pregunta no va de dinero ni de estos datos, dilo en una frase y vuelve al tema.
- Escribe en español de España, en texto plano. Si enumeras, usa líneas que empiecen por "- ". Nada de markdown, títulos ni negritas.`

/** Datos del mes que se está viendo, pegados al prompt en cada pregunta. */
function contextBlock(context: MonthContext, today: Date): string {
  const alcance = context.cuenta
    ? `la cuenta "${context.cuenta}"`
    : 'todas las cuentas juntas'

  return `Hoy es ${today.toISOString().slice(0, 10)}.

Ahora mismo está mirando ${monthName(context.mes)} de ${context.mes.slice(0, 4)} (${context.mes}) y ${alcance}. Cuando pregunte por "este mes" o no diga fechas, se refiere a eso.

Resumen de ese mes, en euros:
${JSON.stringify(context, null, 2)}

Notas: "porCategoria" y "principalesComercios" solo incluyen gastos. "gastosFijos" son gastos recurrentes registrados a mano, que pueden solaparse con los movimientos reales, y llegan vacíos cuando se mira una sola cuenta. "mesAnterior" es null si no hay movimientos del mes anterior.`
}

export interface ChatHistoryMessage {
  role: string
  content: string
}

export interface ChatReply {
  text: string
  model: string
  /** Herramientas que ha consultado para responder, en orden. */
  toolsUsed: string[]
}

/**
 * Responde a una pregunta. `history` va de más antigua a más reciente y no
 * incluye la pregunta actual.
 */
export async function answerChat(options: {
  question: string
  history: ChatHistoryMessage[]
  context: MonthContext
  toolContext: ToolContext
  today?: Date
}): Promise<ChatReply> {
  const systemPrompt = `${SYSTEM_PROMPT}

${contextBlock(options.context, options.today ?? new Date())}`

  const steps: ChatStep[] = options.history.map((message) =>
    message.role === 'assistant'
      ? { type: 'model_output', content: [{ type: 'text', text: message.content }] }
      : { type: 'user_input', content: [{ type: 'text', text: message.content }] }
  )
  steps.push({ type: 'user_input', content: [{ type: 'text', text: options.question }] })

  const toolsUsed: string[] = []

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // En la última vuelta se le retiran las herramientas: así no puede pedir
    // más datos y tiene que responder con lo que ya ha reunido.
    const turn = await generateChatTurn({
      model: CHAT_MODEL,
      systemPrompt,
      steps,
      tools: round < MAX_TOOL_ROUNDS ? CHAT_TOOLS : undefined,
    })

    if (turn.calls.length === 0) {
      return {
        text:
          turn.text ||
          'No he sabido responder a eso. Prueba a preguntarlo de otra forma, o con un periodo concreto.',
        model: turn.model,
        toolsUsed,
      }
    }

    // Lo que ha devuelto el modelo se encadena tal cual, sin reescribirlo: su
    // razonamiento va firmado y la API exige recibir la firma de vuelta junto
    // a la llamada que la acompaña.
    steps.push(...turn.steps)

    for (const call of turn.calls) {
      toolsUsed.push(call.name)
      steps.push({
        type: 'function_result',
        call_id: call.id,
        name: call.name,
        result: await runChatTool(call.name, call.arguments, options.toolContext),
      })
    }
  }

  return {
    text: 'Me he quedado dando vueltas a los datos sin llegar a una respuesta. Prueba a preguntarlo más concreto.',
    model: CHAT_MODEL,
    toolsUsed,
  }
}
