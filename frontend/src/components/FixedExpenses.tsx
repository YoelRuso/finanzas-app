import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Account } from '../api'
import { CATEGORIES as ALL_CATEGORIES, categoryLabel, categoryColor } from '../categories'
import { monthRange } from '../month'
import Section from './Section'
import CategoryIcon from './CategoryIcon'

interface Props {
  accounts: Account[]
  month: Date
  /** Cuenta activa: el gasto real con el que se compara es solo el suyo. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const fmtFull = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const CATEGORIES = ALL_CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }))

export default function FixedExpenses({ accounts, month, accountId }: Props) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formCategory, setFormCategory] = useState('otros')

  const { data: feData } = useQuery({
    queryKey: ['fixedExpenses'],
    queryFn: api.getFixedExpenses,
  })

  // Gasto real del mes seleccionado, para comparar con los gastos fijos
  const { dateFrom, dateTo, label: monthLabel } = monthRange(month)

  const { data: summaryData } = useQuery({
    queryKey: ['summary', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getSummary(dateFrom, dateTo, accountId),
    enabled: accounts.length > 0,
  })

  const fixedExpenses = feData?.fixedExpenses ?? []
  const fixedTotal = feData?.total ?? 0
  const actualSpent = summaryData?.summary.reduce((s, c) => s + c.total, 0) ?? 0
  const variableSpent = Math.max(0, actualSpent - fixedTotal)
  const barTotal = Math.max(actualSpent, fixedTotal, 1)

  const createMutation = useMutation({
    mutationFn: (data: { name: string; amount: number; category: string }) =>
      api.createFixedExpense(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fixedExpenses'] })
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; amount: number; category: string }) =>
      api.updateFixedExpense(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fixedExpenses'] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteFixedExpense,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fixedExpenses'] })
    },
  })

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
    setFormAmount('')
    setFormCategory('otros')
  }

  function startEdit(expense: { id: number; name: string; amount: number; category: string | null }) {
    setEditingId(expense.id)
    setFormName(expense.name)
    setFormAmount(String(expense.amount))
    setFormCategory(expense.category ?? 'otros')
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(formAmount)
    if (!formName.trim() || isNaN(amount) || amount <= 0) return

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, name: formName.trim(), amount, category: formCategory })
    } else {
      createMutation.mutate({ name: formName.trim(), amount, category: formCategory })
    }
  }

  // Fuera del panel ya no hay selector de mes a la vista, así que el mes con
  // el que se compara lo dice la propia cabecera del apartado.
  return (
    <Section
      id="balance"
      title="Balance mensual"
      subtitle={`fijos vs variables · ${monthLabel.toLowerCase()}`}
      actions={
        <button
          onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone transition-colors border-b border-transparent hover:border-fog pb-px"
        >
          {showForm ? 'Cancelar' : '+ Gasto fijo'}
        </button>
      }
    >
      {/* comparison bar — only when there's data */}
      {(fixedTotal > 0 || actualSpent > 0) && (
        <div className="px-6 py-6 border-b border-wall">
          {/* stacked bar */}
          <div className="h-4 bg-wall/40 rounded-full overflow-hidden flex">
            {fixedTotal > 0 && (
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${(fixedTotal / barTotal) * 100}%`,
                  background: 'linear-gradient(90deg, #D4B87A, #C4A86A)',
                }}
              />
            )}
            {variableSpent > 0 && (
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${(variableSpent / barTotal) * 100}%`,
                  background: 'linear-gradient(90deg, #7EB8DA, #6AA8CA)',
                }}
              />
            )}
          </div>

          {/* legend */}
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-brass" />
                <span className="font-mono text-[10px] text-fog uppercase tracking-wide">Fijos</span>
              </div>
              <span className="font-mono text-lg text-stone">{fmt.format(fixedTotal)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#7EB8DA' }} />
                <span className="font-mono text-[10px] text-fog uppercase tracking-wide">Variables</span>
              </div>
              <span className="font-mono text-lg text-stone">{fmt.format(variableSpent)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-wall" />
                <span className="font-mono text-[10px] text-fog uppercase tracking-wide">Total gastado</span>
              </div>
              <span className="font-mono text-lg text-rust">{fmt.format(actualSpent)}</span>
            </div>
          </div>

          {actualSpent > 0 && fixedTotal > 0 && (
            <p className="font-mono text-[11px] text-dust mt-4">
              {((fixedTotal / actualSpent) * 100).toFixed(0)}% de tu gasto este mes son gastos fijos
              {variableSpent > 0 && ` — ${fmt.format(variableSpent)} en gastos variables`}
            </p>
          )}
        </div>
      )}

      {/* inline form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="px-6 py-4 border-b border-wall bg-shell/50">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="font-mono text-[10px] text-dust block mb-1 uppercase tracking-wide">Nombre</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Gimnasio, peluquero..."
                className="w-full bg-pit border border-wall text-stone px-3 py-2 font-mono text-sm outline-none focus:border-brass transition-colors"
                autoFocus
              />
            </div>
            <div className="w-28">
              <label className="font-mono text-[10px] text-dust block mb-1 uppercase tracking-wide">Importe</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="45"
                className="w-full bg-pit border border-wall text-stone px-3 py-2 font-mono text-sm outline-none focus:border-brass transition-colors"
              />
            </div>
            <div className="w-40">
              <label className="font-mono text-[10px] text-dust block mb-1 uppercase tracking-wide">Categoría</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full bg-pit border border-wall text-stone px-3 py-2 font-mono text-sm outline-none focus:border-brass transition-colors appearance-none cursor-pointer"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!formName.trim() || !formAmount || parseFloat(formAmount) <= 0}
              className="px-5 py-2 border border-stone text-stone text-[11px] font-mono uppercase tracking-wide hover:bg-stone hover:text-void disabled:border-wall disabled:text-dust disabled:cursor-not-allowed transition-colors"
            >
              {editingId !== null ? 'Guardar' : 'Añadir'}
            </button>
          </div>
        </form>
      )}

      {/* empty state */}
      {fixedExpenses.length === 0 && !showForm && (
        <div className="px-6 py-12 text-center">
          <p className="font-mono text-sm text-dust mb-2">
            Define tus gastos fijos mensuales
          </p>
          <p className="font-mono text-xs text-dust/70">
            Gimnasio, suscripciones, seguros, transporte… lo que pagas sí o sí cada mes
          </p>
        </div>
      )}

      {/* list */}
      {fixedExpenses.length > 0 && (
        <div>
          {fixedExpenses.map((expense) => {
            const catColor = categoryColor(expense.category)
            const catLabel = CATEGORIES.find((c) => c.value === expense.category)?.label ?? expense.category ?? 'Otros'

            return (
              <div
                key={expense.id}
                className="flex items-center gap-3 px-6 py-3 border-b border-wall hover:bg-shell transition-colors group"
              >
                {/* emoji propio del gasto, o el icono de su categoría */}
                <span className="w-6 shrink-0 flex items-center justify-center text-base">
                  {expense.icon ?? (
                    <span style={{ color: catColor }}>
                      <CategoryIcon category={expense.category} className="w-4 h-4" />
                    </span>
                  )}
                </span>

                {/* name */}
                <span className="font-sans text-sm text-stone flex-1">{expense.name}</span>

                {/* category */}
                <span
                  className="hidden md:inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded text-[10px] font-mono tracking-wide shrink-0"
                  style={{
                    backgroundColor: `${catColor}15`,
                    color: catColor,
                  }}
                >
                  <CategoryIcon category={expense.category} className="w-3.5 h-3.5" />
                  {catLabel}
                </span>

                {/* amount */}
                <span className="font-mono text-sm text-fog tabular-nums w-20 text-right">
                  {fmtFull.format(expense.amount)}
                </span>

                {/* actions */}
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => startEdit(expense)}
                    className="font-mono text-[10px] text-dust hover:text-stone transition-colors"
                  >
                    editar
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(expense.id)}
                    className="font-mono text-[10px] text-dust hover:text-rust transition-colors"
                  >
                    borrar
                  </button>
                </div>
              </div>
            )
          })}

          {/* total row */}
          <div className="flex items-center gap-3 px-6 py-3 bg-pit/50">
            <span className="w-6 shrink-0" />
            <span className="font-sans text-sm text-fog flex-1">Total gastos fijos</span>
            <span className="font-mono text-sm text-brass tabular-nums w-20 text-right font-medium">
              {fmtFull.format(fixedTotal)}
            </span>
            <div className="w-[72px] shrink-0" />
          </div>
        </div>
      )}
    </Section>
  )
}
