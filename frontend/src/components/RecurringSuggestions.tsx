import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Account, type RecurringSuggestion } from '../api'
import { CATEGORIES as ALL_CATEGORIES, categoryLabel, categoryColor } from '../categories'
import Section from './Section'
import CategoryIcon from './CategoryIcon'
import Badge from './Badge'

interface Props {
  accounts: Account[]
  /** Cuenta activa: solo se busca en sus movimientos. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const fmtDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' })

const CATEGORIES = ALL_CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }))

/** Los campos de una propuesta que se pueden retocar antes de confirmarla. */
interface Draft {
  name: string
  amount: string
  category: string
}

/**
 * La prueba de que algo es un gasto fijo, en una línea: de dónde sale, cada
 * cuánto llega y si el importe es siempre el mismo. Sin esto la propuesta es
 * un número que hay que creerse; con esto se decide de un vistazo.
 */
function evidence(s: RecurringSuggestion): string {
  const cadencia = s.everyDays >= 28 && s.everyDays <= 31 ? 'cada mes' : `cada ${s.everyDays} días`
  const importe =
    s.minAmount === s.maxAmount
      ? `siempre ${fmt.format(s.amount)}`
      : `entre ${fmt.format(s.minAmount)} y ${fmt.format(s.maxAmount)}`

  return `${s.count} cargos desde el ${fmtDate.format(new Date(s.firstDate))} · ${cadencia} · ${importe}`
}

/**
 * Gastos fijos que el histórico delata y no están en la lista.
 *
 * Mismo trato que las propuestas de categoría: el detector encuentra, la
 * pantalla confirma. Nada se guarda hasta que se pulsa «añadir», y descartar
 * se recuerda para no volver a ofrecer lo mismo cada vez que se entra aquí.
 */
export default function RecurringSuggestions({ accounts, accountId }: Props) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [toast, setToast] = useState('')
  /** Último descarte, para poder deshacerlo desde el aviso. */
  const [undoKey, setUndoKey] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['recurring-suggestions', accountId ?? 'all'],
    queryFn: () => api.getRecurringSuggestions(accountId),
    enabled: accounts.length > 0,
  })

  const suggestions = data?.suggestions ?? []

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['recurring-suggestions'] })
    void queryClient.invalidateQueries({ queryKey: ['fixedExpenses'] })
  }

  function flash(message: string, undo: string | null = null) {
    setToast(message)
    setUndoKey(undo)
    setTimeout(() => {
      setToast('')
      setUndoKey(null)
    }, 6000)
  }

  /** Lo que se guardaría: lo retocado si se ha tocado, si no lo propuesto. */
  function draftOf(s: RecurringSuggestion): Draft {
    return drafts[s.key] ?? { name: s.name, amount: String(s.amount), category: s.category }
  }

  function setDraft(s: RecurringSuggestion, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [s.key]: { ...draftOf(s), ...patch } }))
  }

  const add = useMutation({
    mutationFn: (s: RecurringSuggestion) => {
      const draft = draftOf(s)
      return api.createFixedExpense({
        name: draft.name.trim(),
        amount: parseFloat(draft.amount),
        category: draft.category,
        // Deja constancia del comercio: así no se vuelve a proponer.
        sourceKey: s.key,
      })
    },
    onSuccess: (res) => {
      flash(`${res.expense.name} añadido a gastos fijos`)
      invalidate()
    },
    onError: (error: unknown) =>
      flash(error instanceof Error ? error.message : 'No se pudo añadir'),
  })

  const dismiss = useMutation({
    mutationFn: (s: RecurringSuggestion) => api.dismissRecurring(s.key),
    onSuccess: (_res, s) => {
      flash(`${s.name} descartado`, s.key)
      invalidate()
    },
    onError: () => flash('No se pudo descartar'),
  })

  const restore = useMutation({
    mutationFn: (key: string) => api.restoreRecurring(key),
    onSuccess: () => {
      flash('Descarte deshecho')
      invalidate()
    },
  })

  // Mientras no haya nada que proponer, el apartado no existe: es una tarea
  // que aparece cuando hay trabajo, no un panel permanente medio vacío.
  if (isLoading || suggestions.length === 0) return null

  const total = suggestions.reduce((sum, s) => sum + s.amount, 0)

  return (
    <Section
      id="detectados"
      title="Gastos fijos detectados"
      subtitle={`${suggestions.length} ${suggestions.length === 1 ? 'comercio' : 'comercios'}`}
      actions={
        toast && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-moss">
            <span className="max-w-[18rem] truncate" title={toast}>
              {toast}
            </span>
            {undoKey && (
              <button
                onClick={() => restore.mutate(undoKey)}
                className="text-fog hover:text-stone underline underline-offset-2 transition-colors"
              >
                deshacer
              </button>
            )}
          </span>
        )
      }
    >
      <p className="px-6 py-3 border-b border-wall font-mono text-[11px] text-dust leading-relaxed">
        Cargos que se repiten cada mes por un importe estable y no están en tu lista.
        Suman {fmt.format(total)} al mes.
      </p>

      {suggestions.map((s) => {
        const draft = draftOf(s)
        const amount = parseFloat(draft.amount)
        const valid = draft.name.trim() !== '' && !isNaN(amount) && amount > 0
        const color = categoryColor(draft.category)

        return (
          <div key={s.key} className="px-6 py-4 border-b border-wall hover:bg-shell transition-colors">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-6 shrink-0 flex items-center justify-center" style={{ color }}>
                <CategoryIcon category={draft.category} className="w-4 h-4" />
              </span>

              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft(s, { name: e.target.value })}
                aria-label="Nombre del gasto fijo"
                className="flex-1 min-w-[140px] bg-pit border border-wall text-stone px-3 py-1.5 font-sans text-sm outline-none focus:border-brass transition-colors"
              />

              <select
                value={draft.category}
                onChange={(e) => setDraft(s, { category: e.target.value })}
                aria-label="Categoría"
                className="w-32 bg-pit border border-wall text-stone px-2 py-1.5 font-mono text-xs outline-none focus:border-brass transition-colors appearance-none cursor-pointer"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                min="0"
                value={draft.amount}
                onChange={(e) => setDraft(s, { amount: e.target.value })}
                aria-label="Importe mensual"
                className="w-24 bg-pit border border-wall text-stone px-2 py-1.5 font-mono text-sm tabular-nums text-right outline-none focus:border-brass transition-colors"
              />

              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => add.mutate(s)}
                  disabled={!valid || add.isPending}
                  className="font-mono text-[11px] uppercase tracking-wide text-moss hover:text-stone disabled:text-dust disabled:cursor-not-allowed transition-colors border-b border-moss/40 hover:border-stone disabled:border-transparent pb-px"
                >
                  añadir
                </button>
                <button
                  onClick={() => dismiss.mutate(s)}
                  disabled={dismiss.isPending}
                  title="No es un gasto fijo — no volver a proponerlo"
                  className="font-mono text-[11px] uppercase tracking-wide text-dust hover:text-rust transition-colors"
                >
                  descartar
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 pl-9">
              <Badge tone={s.confidence === 'alta' ? 'good' : 'warn'}>
                {s.confidence === 'alta' ? 'importe clavado' : 'importe variable'}
              </Badge>
              <span className="font-mono text-[11px] text-dust">{evidence(s)}</span>
            </div>

            <p className="font-mono text-[10px] text-dust/70 mt-1 pl-9 truncate" title={s.sample}>
              {s.sample}
            </p>
          </div>
        )
      })}
    </Section>
  )
}
