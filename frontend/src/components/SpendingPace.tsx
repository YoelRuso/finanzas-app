import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Account } from '../api'
import { monthRange, monthKey, monthKeyToDate, addMonths } from '../month'
import Section from './Section'

interface Props {
  accounts: Account[]
  month: Date
  /** Cuenta activa; sin ella, el ritmo es el de todas juntas. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const fmtDay = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

/** Acepta "600", "600,50" y "600.50": el teclado del móvil da coma. */
function parseAmount(raw: string): number | null {
  const value = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Ritmo de gasto del mes y proyección de cierre. Reutiliza las mismas claves
 * de query que el resto del dashboard, así que no dispara peticiones extra.
 *
 * Con un presupuesto mensual puesto, la barra deja de medir días y mide
 * dinero: cuánto llevas gastado del límite, con una marca en el punto donde
 * deberías ir hoy. Es la respuesta rápida a "¿voy bien o me estoy pasando?".
 */
export default function SpendingPace({ accounts, month, accountId }: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const { dateFrom, dateTo, daysInMonth, elapsedDays, isCurrent } = monthRange(month)

  const { data } = useQuery({
    queryKey: ['summary', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getSummary(dateFrom, dateTo, accountId),
    enabled: accounts.length > 0,
  })

  const { data: monthsData } = useQuery({
    queryKey: ['months', accountId ?? 'all'],
    queryFn: () => api.getMonths(accountId),
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  })

  const saveBudget = useMutation({
    mutationFn: (value: number | null) => api.setMonthlyBudget(value),
    onSuccess: () => {
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const spent = (data?.summary ?? []).reduce((sum, c) => sum + c.total, 0)

  if (accounts.length === 0 || elapsedDays === 0 || spent === 0) return null

  const perDay = spent / elapsedDays
  // En un mes cerrado la "proyección" ya es el dato real.
  const projected = isCurrent ? perDay * daysInMonth : spent
  const remainingDays = Math.max(0, daysInMonth - elapsedDays)

  const previousKey = monthKey(addMonths(month, -1))
  const previous = monthsData?.months.find((m) => m.month === previousKey)
  const delta =
    previous && previous.spent > 0
      ? ((projected - previous.spent) / previous.spent) * 100
      : null
  const spendingDown = delta !== null && delta < 0

  // El presupuesto es del gasto total: comparar una sola cuenta contra él
  // daría un "vas bien" falso, así que en vista filtrada no se enseña.
  const budget = accountId ? null : (settings?.monthlyBudget ?? null)

  // Lo que llevarías gastado hoy yendo justo al ritmo del presupuesto.
  const onPace = budget ? (budget * elapsedDays) / daysInMonth : 0
  const ahead = budget ? spent - onPace : 0
  const usedPct = budget ? Math.min(100, (spent / budget) * 100) : 0
  const pacePct = budget ? Math.min(100, (elapsedDays / daysInMonth) * 100) : 0
  const overBudget = budget !== null && spent > budget
  const leftPerDay =
    budget && isCurrent && remainingDays > 0 ? (budget - spent) / remainingDays : null

  // Sin presupuesto la barra sigue midiendo el avance del mes.
  const barPct = budget ? usedPct : Math.min(100, (elapsedDays / daysInMonth) * 100)
  const barTone = !budget
    ? 'bg-brass/70'
    : overBudget
      ? 'bg-rust'
      : ahead > 0
        ? 'bg-brass'
        : 'bg-moss'

  function startEditing() {
    setDraft(budget ? String(budget) : '')
    setEditing(true)
  }

  return (
    <Section title="Ritmo" subtitle={isCurrent ? 'en curso' : 'cerrado'}>
      <div className="px-5 py-5">
        {/* ── Gasto por día, y la meta si hay presupuesto ── */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-2xl text-stone tabular-nums leading-none">
            {fmtDay.format(perDay)}
            <span className="text-dust text-sm ml-1">/día</span>
          </p>
          {budget && (
            <p className="font-mono text-[10px] text-dust tabular-nums shrink-0">
              meta {fmtDay.format(budget / daysInMonth)}
            </p>
          )}
        </div>

        {/* ── Barra: dinero gastado del presupuesto, o avance del mes ── */}
        <div className="mt-4 relative h-2 bg-wall/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barTone}`}
            style={{ width: `${barPct}%` }}
          />
          {/* Dónde deberías ir hoy: todo lo que sobrepase esta marca es exceso. */}
          {budget && (
            <span
              aria-hidden="true"
              title="Ritmo ideal a día de hoy"
              className="absolute top-0 bottom-0 w-px bg-stone/70"
              style={{ left: `${pacePct}%` }}
            />
          )}
        </div>

        <p className="font-mono text-[10px] text-dust mt-2 tabular-nums">
          {budget
            ? `${Math.round((spent / budget) * 100)}% de ${fmt.format(budget)} · ${elapsedDays}/${daysInMonth} días`
            : `${elapsedDays} de ${daysInMonth} días${
                isCurrent && remainingDays > 0 ? ` · quedan ${remainingDays}` : ''
              }`}
        </p>

        {/* ── Por encima o por debajo del ritmo ideal ───── */}
        {budget && (
          <p className="mt-1.5 font-mono text-[11px] tabular-nums">
            <span className={ahead > 0 ? 'text-rust' : 'text-moss'}>
              {ahead > 0 ? '↑' : '↓'} {fmt.format(Math.abs(ahead))}
            </span>
            <span className="text-dust ml-1.5">
              {ahead > 0 ? 'por encima del ritmo' : 'por debajo del ritmo'}
            </span>
          </p>
        )}

        {/* Lo que queda por día para no pasarse: el número accionable. */}
        {leftPerDay !== null && (
          <p className="mt-1 font-mono text-[10px] text-dust tabular-nums">
            {leftPerDay > 0
              ? `te quedan ${fmtDay.format(leftPerDay)}/día`
              : 'presupuesto agotado'}
          </p>
        )}

        {/* ── Cierre estimado ───────────────────────────── */}
        <div className="mt-5 pt-4 border-t border-wall">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1.5">
            {isCurrent ? 'Cierre estimado' : 'Total del mes'}
          </p>
          <p className="font-mono text-lg text-stone tabular-nums leading-none">
            {isCurrent && '~'}
            {fmt.format(projected)}
            {budget && (
              <span className="text-dust text-[11px] ml-1.5">de {fmt.format(budget)}</span>
            )}
          </p>

          {budget && (
            <p
              className={`mt-1.5 font-mono text-[11px] tabular-nums ${
                projected > budget ? 'text-rust' : 'text-moss'
              }`}
            >
              {projected > budget
                ? `✗ te pasas de ${fmt.format(projected - budget)}`
                : `✓ dentro · sobran ${fmt.format(budget - projected)}`}
            </p>
          )}

          {delta !== null && (
            <p className="mt-2 font-mono text-[11px] tabular-nums">
              <span className={spendingDown ? 'text-moss' : 'text-rust'}>
                {spendingDown ? '↓' : '↑'} {delta > 0 ? '+' : ''}
                {delta.toFixed(0)}%
              </span>
              <span className="text-dust ml-1.5">
                vs. {monthKeyToDate(previousKey).toLocaleDateString('es-ES', { month: 'long' })}
              </span>
            </p>
          )}
        </div>

        {/* ── Poner o cambiar el presupuesto ────────────── */}
        {!accountId && (
          <div className="mt-4 pt-3 border-t border-wall">
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  saveBudget.mutate(parseAmount(draft))
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing(false)
                  }}
                  placeholder="600"
                  aria-label="Presupuesto mensual en euros"
                  className="w-20 bg-transparent border-b border-brass font-mono text-xs text-stone placeholder:text-dust outline-none tabular-nums"
                />
                <span className="font-mono text-[10px] text-dust">€/mes</span>
                <button
                  type="submit"
                  disabled={saveBudget.isPending}
                  className="ml-auto font-mono text-[11px] text-moss hover:text-stone transition-colors disabled:text-dust"
                >
                  {/* Guardar vacío es la forma de quitarlo. */}
                  {draft.trim() === '' ? 'quitar' : 'guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="font-mono text-[11px] text-dust hover:text-stone transition-colors"
                >
                  ×
                </button>
              </form>
            ) : (
              <button
                onClick={startEditing}
                className="w-full flex items-center justify-between gap-2 font-mono text-[10px] text-dust hover:text-fog transition-colors"
              >
                <span className="uppercase tracking-[0.15em]">presupuesto</span>
                <span className="tabular-nums">
                  {budget ? `${fmt.format(budget)}/mes ✎` : 'poner ✎'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
