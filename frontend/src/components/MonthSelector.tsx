import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { monthKey, monthKeyToDate, monthRange, startOfMonth } from '../month'

interface Props {
  month: Date
  onChange: (month: Date) => void
  /** Cuenta activa: las barras son solo de esa cuenta. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const fmtExact = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

/** ENE, FEB, … a partir del índice 0-11. */
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1)
    .toLocaleDateString('es-ES', { month: 'short' })
    .replace('.', '')
    .toUpperCase()
)

/** "2026-08" a partir de año y mes 0-11. */
function keyOf(year: number, index: number): string {
  return `${year}-${String(index + 1).padStart(2, '0')}`
}

/**
 * Selector de mes en dos pasos: primero el año, luego el mes dentro de ese año.
 * La tira única con todos los meses seguidos se hacía ilegible en cuanto había
 * más de un año de datos, y no se veía a simple vista dónde se gastó más.
 * Cada mes lleva una barra proporcional al gasto de ese año, así el propio
 * selector ya cuenta la historia del año.
 */
export default function MonthSelector({ month, onChange, accountId }: Props) {
  const { data } = useQuery({
    queryKey: ['months', accountId ?? 'all'],
    queryFn: () => api.getMonths(accountId),
  })

  const months = data?.months ?? []
  const range = monthRange(month)
  const current = startOfMonth(new Date())
  const currentKey = monthKey(current)
  const selectedYear = month.getFullYear()

  // El año que se está mirando puede no ser el del mes seleccionado: se puede
  // hojear 2025 sin perder el mes activo hasta que se pulsa uno.
  const [viewYear, setViewYear] = useState(selectedYear)

  // Si el mes cambia desde fuera (atajo "Hoy", otra pantalla), seguimos su año.
  useEffect(() => setViewYear(selectedYear), [selectedYear])

  // Años navegables: los que tienen datos, más el actual y el seleccionado.
  const years = new Set(months.map((m) => Number(m.month.slice(0, 4))))
  years.add(current.getFullYear())
  years.add(selectedYear)
  const firstYear = Math.min(...years)
  const lastYear = Math.max(...years, current.getFullYear())

  const byKey = new Map(months.map((m) => [m.month, m]))
  const yearMonths = MONTH_LABELS.map((label, i) => {
    const key = keyOf(viewYear, i)
    return { key, label, summary: byKey.get(key), isFuture: key > currentKey }
  })

  // Escala de las barras: el mes más caro del año llena la altura completa.
  const maxSpent = Math.max(...yearMonths.map((m) => m.summary?.spent ?? 0), 1)

  const yearSpent = yearMonths.reduce((sum, m) => sum + (m.summary?.spent ?? 0), 0)
  const selected = byKey.get(range.key)

  return (
    <div className="panel px-4 sm:px-5 py-3.5">
      {/* ── Año + resumen del mes elegido ───────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewYear(viewYear - 1)}
            disabled={viewYear <= firstYear}
            aria-label="Año anterior"
            className="w-6 h-6 flex items-center justify-center font-mono text-sm text-fog hover:text-stone hover:bg-pit disabled:text-wall disabled:hover:bg-transparent transition-colors"
          >
            ‹
          </button>
          <span className="font-display text-lg text-stone tabular-nums px-1">
            {viewYear}
          </span>
          <button
            onClick={() => setViewYear(viewYear + 1)}
            disabled={viewYear >= lastYear}
            aria-label="Año siguiente"
            className="w-6 h-6 flex items-center justify-center font-mono text-sm text-fog hover:text-stone hover:bg-pit disabled:text-wall disabled:hover:bg-transparent transition-colors"
          >
            ›
          </button>

          {yearSpent > 0 && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.15em] text-dust hidden sm:inline">
              {fmt.format(yearSpent)} en el año
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-[11px] text-dust tabular-nums">
            {selected
              ? `${selected.count} mov. · ${fmtExact.format(selected.spent)}`
              : 'sin datos'}
          </span>
          {!range.isCurrent && (
            <button
              onClick={() => onChange(current)}
              className="px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase text-fog hover:text-stone border border-wall hover:border-fog transition-colors"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* ── Los doce meses del año ──────────────────────────────── */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
        {yearMonths.map(({ key, label, summary, isFuture }) => {
          const active = key === range.key
          const spent = summary?.spent ?? 0
          const height = spent > 0 ? Math.max(8, (spent / maxSpent) * 100) : 0

          return (
            <button
              key={key}
              onClick={() => onChange(monthKeyToDate(key))}
              disabled={isFuture}
              aria-current={active ? 'true' : undefined}
              title={
                summary
                  ? `${summary.count} movimientos — ${fmtExact.format(summary.spent)} de gasto`
                  : isFuture
                    ? 'Mes futuro'
                    : 'Sin movimientos'
              }
              className={`group flex flex-col items-stretch gap-1.5 px-1 pt-1.5 pb-1 transition-colors ${
                active ? 'bg-pit' : isFuture ? '' : 'hover:bg-shell'
              } ${isFuture ? 'cursor-default' : ''}`}
            >
              {/* Barra de gasto: el mes vacío deja el carril a la vista. */}
              <span className="relative block h-8 bg-void/60 overflow-hidden">
                <span
                  style={{ height: `${height}%` }}
                  className={`absolute inset-x-0 bottom-0 transition-[height,background-color] duration-200 ${
                    active ? 'bg-brass' : 'bg-dust/60 group-hover:bg-fog'
                  }`}
                />
              </span>

              <span
                className={`font-mono text-[10px] tracking-[0.1em] text-center transition-colors ${
                  active
                    ? 'text-brass'
                    : isFuture
                      ? 'text-wall'
                      : 'text-dust group-hover:text-fog'
                }`}
              >
                {label}
              </span>

              {/* Subrayado de la selección, igual que las pestañas de cuentas. */}
              <span
                className={`block h-px ${active ? 'bg-brass' : 'bg-transparent'}`}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
