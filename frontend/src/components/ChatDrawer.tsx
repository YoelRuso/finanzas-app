import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ChatMessage } from '../api'
import { monthKey, monthRange } from '../month'

interface Props {
  open: boolean
  onClose: () => void
  /** Mes que se está viendo. Es lo que el modelo entiende por "este mes". */
  month: Date
  /** Cuenta que se está viendo; sin ella el chat habla de todas. */
  accountId?: string
  accountLabel?: string
}

/** Preguntas de arranque. Están para enseñar de qué se le puede hablar. */
const SUGGESTIONS = [
  '¿En qué se me ha ido el dinero este mes?',
  '¿Qué gasto ha subido más respecto al mes pasado?',
  '¿Qué es lo que más compro en el súper?',
]

/** Nombre legible de cada herramienta, para decir de dónde salen las cifras. */
const TOOL_LABELS: Record<string, string> = {
  buscar_movimientos: 'movimientos',
  resumen_mes: 'resumen del mes',
  buscar_productos: 'tickets',
}

function toolSummary(tools: string[]): string {
  const names = Array.from(new Set(tools)).map((tool) => TOOL_LABELS[tool] ?? tool)
  return `Ha consultado: ${names.join(', ')}`
}

function Message({ message, tools }: { message: ChatMessage; tools?: string[] }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] bg-pit border border-wall px-3.5 py-2 font-reading text-[13.5px] text-stone leading-[1.6] whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Sin burbuja: la respuesta es lo que se lee, no un turno más. */}
      <p className="font-reading text-[13.5px] text-fog leading-[1.7] whitespace-pre-wrap">
        {message.content}
      </p>
      {tools && tools.length > 0 && (
        <p className="font-mono text-[10px] text-dust mt-1.5">{toolSummary(tools)}</p>
      )}
    </div>
  )
}

/**
 * Chat sobre los datos propios. Vive en un panel lateral y no en un apartado
 * del dashboard a propósito: así se puede preguntar por una gráfica mientras
 * se está mirando, sin perderla de vista.
 */
export default function ChatDrawer({ open, onClose, month, accountId, accountLabel }: Props) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  /**
   * Herramientas de cada respuesta, por id de mensaje. No se guardan en la
   * base de datos: solo sirven para dar contexto a lo que acaba de llegar.
   */
  const [tools, setTools] = useState<Record<number, string[]>>({})
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const key = monthKey(month)
  const { label: monthLabel } = monthRange(month)

  const { data, isLoading } = useQuery({
    queryKey: ['chat'],
    queryFn: api.getChat,
    // Preguntar cuesta una llamada a la API: no hay nada que refrescar solo.
    enabled: open,
    refetchOnWindowFocus: false,
  })

  const messages = data?.messages ?? []

  const send = useMutation({
    mutationFn: (question: string) => api.sendChat(question, key, accountId),
    onSuccess: (reply) => {
      queryClient.setQueryData(['chat'], (previous: { messages: ChatMessage[] } | undefined) => ({
        messages: [...(previous?.messages ?? []), ...reply.messages],
      }))
      const answer = reply.messages.find((message) => message.role === 'assistant')
      if (answer && reply.toolsUsed.length > 0) {
        setTools((current) => ({ ...current, [answer.id]: reply.toolsUsed }))
      }
    },
  })

  const clear = useMutation({
    mutationFn: api.clearChat,
    onSuccess: () => {
      queryClient.setQueryData(['chat'], { messages: [] })
      setTools({})
      send.reset()
    },
  })

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // La conversación crece por abajo: hay que seguirla.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, send.isPending])

  if (!open) return null

  function submit(question: string) {
    const text = question.trim()
    if (!text || send.isPending) return
    setDraft('')
    send.mutate(text)
  }

  const scope = accountLabel ?? 'Todas las cuentas'
  const empty = messages.length === 0 && !send.isPending

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-void/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-label="Chat sobre tus finanzas"
        className="drawer-in fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-shell border-l border-wall flex flex-col"
      >
        {/* ── Cabecera ─────────────────────────────────── */}
        <header className="flex items-center justify-between gap-3 px-5 h-14 border-b border-wall shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-[2px] h-3.5 bg-brass shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-stone">Chat</h2>
              {/* El chat hereda mes y cuenta de la página: conviene verlo. */}
              <p className="font-mono text-[10px] text-dust truncate">
                {monthLabel.toLowerCase()} · {scope}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {messages.length > 0 && (
              <button
                onClick={() => clear.mutate()}
                disabled={clear.isPending || send.isPending}
                className="font-mono text-[10px] tracking-widest uppercase text-dust hover:text-rust disabled:opacity-40 transition-colors"
              >
                Borrar
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Cerrar el chat"
              className="font-mono text-sm text-dust hover:text-stone transition-colors leading-none"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ── Conversación ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {isLoading && <p className="font-mono text-[11px] text-dust">Cargando…</p>}

          {empty && !isLoading && (
            <div className="space-y-4">
              <p className="font-reading text-[13.5px] text-fog leading-[1.7]">
                Pregúntame lo que quieras sobre tus gastos. Miro tus movimientos y tus
                tickets de verdad, así que puedo bajar al detalle.
              </p>
              <div className="space-y-2">
                {SUGGESTIONS.map((question) => (
                  <button
                    key={question}
                    onClick={() => submit(question)}
                    className="block w-full text-left border border-wall hover:border-fog px-3.5 py-2 font-reading text-[13px] text-fog hover:text-stone transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <Message key={message.id} message={message} tools={tools[message.id]} />
          ))}

          {send.isPending && (
            <>
              <div className="flex justify-end">
                <p className="max-w-[85%] bg-pit border border-wall px-3.5 py-2 font-reading text-[13.5px] text-dust leading-[1.6] whitespace-pre-wrap">
                  {send.variables}
                </p>
              </div>
              <p className="font-mono text-[11px] text-dust">
                Mirando tus datos
                <span className="scan-dot">.</span>
                <span className="scan-dot">.</span>
                <span className="scan-dot">.</span>
              </p>
            </>
          )}

          {send.isError && (
            <div className="border border-rust/40 bg-rust/[0.06] px-3.5 py-2.5">
              <p className="font-mono text-[11px] text-rust leading-relaxed">
                {send.error instanceof Error ? send.error.message : 'Error desconocido'}
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Escribir ─────────────────────────────────── */}
        <div className="border-t border-wall p-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter envía; con Shift hace párrafo, como en cualquier chat.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit(draft)
                }
              }}
              rows={2}
              placeholder="¿En qué me estoy pasando?"
              disabled={send.isPending}
              className="flex-1 resize-none bg-void border border-wall focus:border-fog px-3 py-2 font-reading text-[13.5px] text-stone placeholder:text-dust outline-none transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => submit(draft)}
              disabled={send.isPending || draft.trim() === ''}
              className="font-mono text-[10px] tracking-widest uppercase text-fog hover:text-stone disabled:text-dust disabled:opacity-40 border border-wall hover:border-fog disabled:border-wall px-3 py-2 transition-colors"
            >
              Enviar
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
