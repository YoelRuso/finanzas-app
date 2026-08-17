import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Account, type AdvicePoint, type AdviceEngine } from '../api'
import { monthRange, monthKey } from '../month'
import Section from './Section'

interface Props {
  accounts: Account[]
  month: Date
  /** Si viene, el consejo analiza solo esa cuenta. */
  accountId?: string
}

const fmtDateTime = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * apiFetch lanza errores con la forma "503: {"error":"..."}".
 * Sacamos el mensaje legible de dentro.
 */
function readableError(error: unknown): string {
  if (!(error instanceof Error)) return 'Error desconocido'
  const match = error.message.match(/^\d+:\s*(.*)$/s)
  if (!match) return error.message
  try {
    const parsed = JSON.parse(match[1]) as { error?: string }
    return parsed.error ?? match[1]
  } catch {
    return match[1]
  }
}

type Tone = 'good' | 'warn'

const TONE = {
  good: { color: '#5CB87A', label: 'Vas bien en' },
  warn: { color: '#CC6565', label: 'Puedes mejorar' },
} as const

function ToneIcon({ tone }: { tone: Tone }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'w-3.5 h-3.5',
    'aria-hidden': true,
  }
  return tone === 'good' ? (
    <svg {...common}>
      <path d="M20 6.5L9.2 17.3 4 12.1" />
    </svg>
  ) : (
    <svg {...common}>
      <path d="M12 9.2v4.4M12 17.4h.01" />
      <path d="M10.3 3.9L1.9 18.1a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  )
}

/**
 * Cada consejo va en su propia tarjeta con filo de color, en lugar de una
 * lista de texto corrido: con 4-5 puntos el bloque se volvía ilegible.
 */
function PointList({ points, tone }: { points: AdvicePoint[]; tone: Tone }) {
  if (points.length === 0) return null
  const { color, label } = TONE[tone]

  return (
    <div>
      <div className="flex items-center gap-2 mb-3" style={{ color }}>
        <ToneIcon tone={tone} />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]">{label}</span>
      </div>

      <ul className="space-y-2.5">
        {points.map((point, i) => (
          <li
            key={i}
            className="border-l-2 rounded-r px-3.5 py-2.5"
            style={{ borderColor: color, backgroundColor: `${color}12` }}
          >
            <p className="font-display font-medium text-sm text-stone leading-snug">{point.titulo}</p>
            <p className="font-reading text-[13.5px] text-fog leading-[1.7] mt-1 max-w-[60ch]">
              {point.detalle}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ENGINES: { value: AdviceEngine; label: string; hint: string }[] = [
  { value: 'local', label: 'Local', hint: 'Análisis por reglas — gratis e instantáneo' },
  { value: 'gemini', label: 'Gemini', hint: 'Análisis con IA — consume cuota de tu clave de Google' },
]

export default function AdvicePanel({
  accounts,
  month,
  accountId,
}: Props) {
  const queryClient = useQueryClient()
  const [engine, setEngine] = useState<AdviceEngine>('local')
  const { label: monthLabel } = monthRange(month)
  const key = monthKey(month)

  // El consejo se cachea por mes y cuenta, en el servidor y aquí.
  const cacheKey = ['advice', key, accountId ?? 'all']

  const { data, isLoading } = useQuery({
    queryKey: cacheKey,
    queryFn: () => api.getAdvice(key, accountId),
    enabled: accounts.length > 0,
  })

  const generate = useMutation({
    mutationFn: () => api.generateAdvice(key, engine, accountId),
    onSuccess: (result) => {
      queryClient.setQueryData(cacheKey, result)
    },
  })

  const advice = data?.advice ?? null
  const isStale = data?.stale ?? false

  return (
    <Section
      id="consejos"
      title="Consejos"
      subtitle={monthLabel}
      actions={
        <>
          {data?.generatedAt && !generate.isPending && (
            <span className="font-mono text-[10px] text-dust hidden sm:inline">
              {fmtDateTime.format(new Date(data.generatedAt))}
            </span>
          )}
          {accounts.length > 0 && (
            <>
              {/* selector de motor */}
              <div className="flex items-center border border-wall rounded-sm overflow-hidden">
                {ENGINES.map((option) => {
                  const active = engine === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => setEngine(option.value)}
                      disabled={generate.isPending}
                      title={option.hint}
                      aria-pressed={active}
                      className={`px-3 py-1 font-mono text-[10px] tracking-widest uppercase transition-colors disabled:opacity-50 ${
                        active
                          ? 'bg-brass text-void font-medium'
                          : 'text-dust hover:text-fog hover:bg-pit'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
                className="font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone disabled:text-dust transition-colors border-b border-transparent hover:border-fog disabled:border-transparent pb-px"
              >
                {generate.isPending ? 'Analizando…' : advice ? 'Regenerar' : 'Analizar'}
              </button>
            </>
          )}
        </>
      }
    >
      {/* aviso de datos obsoletos */}
      {advice && isStale && !generate.isPending && (
        <div className="px-6 py-2.5 border-b border-wall bg-brass/[0.07]">
          <span className="font-mono text-[11px] text-brass">
            Los movimientos han cambiado desde que se generó este análisis
          </span>
        </div>
      )}

      {/* error */}
      {generate.isError && (
        <div className="px-6 py-3 border-b border-wall bg-rust/[0.07]">
          <p className="font-mono text-[11px] text-rust">{readableError(generate.error)}</p>
        </div>
      )}

      {/* estados vacíos */}
      {accounts.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">Conecta un banco para recibir consejos</p>
        </div>
      )}

      {accounts.length > 0 && isLoading && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust animate-pulse">Cargando…</p>
        </div>
      )}

      {accounts.length > 0 && !isLoading && !advice && !generate.isPending && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">Sin análisis para {monthLabel}</p>
          <p className="font-mono text-[11px] text-dust mt-2">
            {engine === 'local'
              ? 'Pulsa «Analizar» — el análisis local es gratis e instantáneo'
              : 'Pulsa «Analizar» para que Gemini revise este mes'}
          </p>
        </div>
      )}

      {generate.isPending && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-fog animate-pulse">
            Analizando tus gastos de {monthLabel}…
          </p>
          {engine === 'gemini' && (
            <p className="font-mono text-[11px] text-dust mt-2">Puede tardar unos segundos</p>
          )}
        </div>
      )}

      {/* contenido */}
      {advice && !generate.isPending && (
        <div>
          {/* resumen */}
          <div className="px-6 py-6 border-b border-wall">
            <p className="font-reading text-[15.5px] text-stone leading-[1.8] max-w-[66ch]">
              {advice.resumen}
            </p>
          </div>

          {/*
            Cada columna lleva el tinte de su valencia. Es casi imperceptible,
            pero basta para saber de un vistazo en qué mitad estás.
          */}
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="px-6 py-6 md:border-r border-b md:border-b-0 border-wall bg-moss/[0.025]">
              <PointList points={advice.puntosFuertes} tone="good" />
            </div>
            <div className="px-6 py-6 bg-rust/[0.025]">
              <PointList points={advice.areasDeMejora} tone="warn" />
            </div>
          </div>

          {/* acciones */}
          {advice.acciones.length > 0 && (
            <div className="px-6 py-6 border-t border-wall bg-brass/[0.04]">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-brass" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust">
                  Para el mes que viene
                </span>
              </div>
              <ul className="space-y-3">
                {advice.acciones.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    {/* badge tipo paso de checklist */}
                    <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center bg-brass/15 border border-brass/40 font-mono text-[10px] text-brass tabular-nums">
                      {i + 1}
                    </span>
                    <div className="pt-0.5">
                      <p className="font-display font-medium text-sm text-stone leading-snug">
                        {item.accion}
                      </p>
                      <p className="font-reading text-[13px] text-fog leading-[1.7] mt-1 max-w-[60ch]">
                        {item.impacto}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* pie */}
          {data?.model && (
            <div className="px-6 py-2.5 border-t border-wall">
              <span className="font-mono text-[10px] text-dust">
                Generado con {data.model} — revisa siempre los números por tu cuenta
              </span>
              {data.model === 'análisis local' && (
                <span className="font-mono text-[10px] text-dust ml-2">
                  · cambia a «Gemini» para un análisis más matizado
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
