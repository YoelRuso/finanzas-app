import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Account, type PendingGroup } from '../api'
import { CATEGORIES, categoryLabel, categoryColor } from '../categories'
import Section from './Section'
import CategoryIcon from './CategoryIcon'

interface Props {
  accounts: Account[]
  /** Cuenta activa: solo se ofrecen sus movimientos sin clasificar. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const fmtDate = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' })

export default function Categorizer({ accounts, accountId }: Props) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [keywords, setKeywords] = useState<Record<string, string>>({})
  const [showRules, setShowRules] = useState(false)
  const [toast, setToast] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['pending-groups', accountId ?? 'all'],
    queryFn: () => api.getPendingGroups('otros', accountId),
    enabled: accounts.length > 0,
  })

  const { data: rulesData } = useQuery({
    queryKey: ['category-rules'],
    queryFn: api.getCategoryRules,
  })

  const groups = data?.groups ?? []
  const rules = rulesData?.rules ?? []

  // Las que están clasificando algo van primero, y de mayor a menor peso:
  // así lo primero que se ve es lo que de verdad sostiene la clasificación.
  const sortedRules = [...rules].sort((a, b) => (b.matches ?? 0) - (a.matches ?? 0))
  const activeRules = rules.filter((r) => (r.matches ?? 0) > 0).length
  const idleRules = rules.length - activeRules

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['pending-groups'] })
    void queryClient.invalidateQueries({ queryKey: ['category-rules'] })
    void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    void queryClient.invalidateQueries({ queryKey: ['summary'] })
  }

  function flash(message: string) {
    setToast(message)
    setTimeout(() => setToast(''), 3500)
  }

  const classify = useMutation({
    mutationFn: ({ group, category }: { group: PendingGroup; category: string }) =>
      api.updateTransactionCategory(group.transactionIds[0], {
        category,
        applyToSimilar: true,
        keyword: keywords[group.key] ?? group.key,
      }),
    onSuccess: (res, { category }) => {
      setExpanded(null)
      flash(
        `${res.applied} ${res.applied === 1 ? 'movimiento' : 'movimientos'} → ${categoryLabel(category)}`
      )
      invalidateAll()
    },
    onError: () => flash('No se pudo guardar la categoría'),
  })

  const recategorize = useMutation({
    mutationFn: api.recategorizeAll,
    onSuccess: (res) => {
      flash(
        res.changed === 0
          ? 'Nada que recategorizar'
          : `${res.changed} de ${res.reviewed} movimientos actualizados`
      )
      invalidateAll()
    },
    onError: () => flash('Error al recategorizar'),
  })

  const deleteRule = useMutation({
    mutationFn: (id: number) => api.deleteCategoryRule(id),
    onSuccess: () => {
      flash('Regla eliminada')
      invalidateAll()
    },
  })

  return (
    <Section
      id="sin-clasificar"
      title="Sin clasificar"
      subtitle={
        groups.length > 0
          ? `${groups.length} ${groups.length === 1 ? 'comercio' : 'comercios'}`
          : undefined
      }
      actions={
        <>
          {toast && <span className="font-mono text-[11px] text-moss">{toast}</span>}
          {accounts.length > 0 && (
            <button
              onClick={() => recategorize.mutate()}
              disabled={recategorize.isPending}
              title="Vuelve a aplicar todas las reglas a los movimientos ya guardados"
              className="font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone disabled:text-dust transition-colors border-b border-transparent hover:border-fog disabled:border-transparent pb-px"
            >
              {recategorize.isPending ? 'Aplicando…' : 'Reaplicar reglas'}
            </button>
          )}
          {rules.length > 0 && (
            <button
              onClick={() => setShowRules((v) => !v)}
              className="font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone transition-colors border-b border-transparent hover:border-fog pb-px"
            >
              {showRules ? 'Ocultar reglas' : `Reglas (${rules.length})`}
            </button>
          )}
        </>
      }
    >
      {/* saved rules */}
      {showRules && rules.length > 0 && (
        <div className="px-6 py-4 border-b border-wall bg-pit/40">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust">
              Reglas guardadas — se aplican a cada sincronización
            </p>
            {idleRules > 0 && (
              <span className="font-mono text-[10px] text-dust shrink-0">
                {activeRules} activas · {idleRules} sin uso
              </span>
            )}
          </div>

          {/*
            Las reglas que están clasificando algo se muestran primero y con
            el color de su categoría; las que no pillan ningún movimiento se
            apagan y lo dicen, que son las candidatas a borrar.
          */}
          <div className="flex flex-wrap gap-2">
            {sortedRules.map((rule) => {
              const matches = rule.matches ?? 0
              const active = matches > 0
              const color = categoryColor(rule.category)

              return (
                <span
                  key={rule.id}
                  title={
                    active
                      ? `Clasifica ${matches} ${matches === 1 ? 'movimiento' : 'movimientos'} como ${categoryLabel(rule.category)}`
                      : 'No coincide con ningún movimiento ahora mismo'
                  }
                  className={`inline-flex items-center gap-2 pl-2 pr-1.5 py-1 border font-mono text-[11px] transition-colors ${
                    active ? 'bg-shell' : 'border-wall/60 opacity-55 hover:opacity-100'
                  }`}
                  style={active ? { borderColor: `${color}66` } : undefined}
                >
                  <span style={{ color }} className="shrink-0">
                    <CategoryIcon category={rule.category} className="w-3.5 h-3.5" />
                  </span>
                  <span className={active ? 'text-stone' : 'text-fog'}>{rule.keyword}</span>
                  <span className="text-dust">→ {categoryLabel(rule.category)}</span>

                  {active ? (
                    <span
                      className="px-1.5 py-px rounded-sm tabular-nums text-[10px]"
                      style={{ backgroundColor: `${color}1F`, color }}
                    >
                      {matches}
                    </span>
                  ) : (
                    <span className="text-dust text-[10px] uppercase tracking-wider">sin uso</span>
                  )}

                  <button
                    onClick={() => deleteRule.mutate(rule.id)}
                    className="text-dust hover:text-rust transition-colors px-1"
                    title="Eliminar regla"
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* empty states */}
      {accounts.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">Conecta un banco para clasificar tus gastos</p>
        </div>
      )}

      {accounts.length > 0 && isLoading && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust animate-pulse">Cargando…</p>
        </div>
      )}

      {accounts.length > 0 && !isLoading && groups.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-moss">Todo clasificado</p>
          <p className="font-mono text-[11px] text-dust mt-2">
            No queda ningún movimiento en «Otros»
          </p>
        </div>
      )}

      {/* groups */}
      {groups.length > 0 && (
        <div>
          {groups.map((group) => {
            const isOpen = expanded === group.key
            const keyword = keywords[group.key] ?? group.key
            const isPending = classify.isPending && classify.variables?.group.key === group.key

            return (
              <div key={group.key} className="border-b border-wall last:border-b-0">
                {/* row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : group.key)}
                  disabled={isPending}
                  className={`w-full flex items-center gap-3 px-6 py-3.5 text-left transition-colors ${
                    isOpen ? 'bg-pit' : 'hover:bg-shell'
                  } disabled:opacity-50`}
                >
                  {/* count */}
                  <span className="font-mono text-[11px] text-dust shrink-0 w-14 tabular-nums">
                    {group.count}×
                  </span>

                  {/* merchant */}
                  <span className="font-sans text-sm text-stone flex-1 truncate">
                    {group.sample}
                  </span>

                  {/* last date */}
                  <span className="hidden md:block font-mono text-[11px] text-dust shrink-0 w-14 text-right">
                    {fmtDate.format(new Date(group.lastDate)).toUpperCase()}
                  </span>

                  {/* total */}
                  <span className="font-mono text-sm text-fog tabular-nums shrink-0 w-24 text-right">
                    {fmt.format(group.total)}
                  </span>

                  {/* chevron */}
                  <span
                    className={`font-mono text-[11px] text-dust shrink-0 w-4 text-right transition-transform ${
                      isOpen ? 'rotate-90' : ''
                    }`}
                  >
                    ›
                  </span>
                </button>

                {/* expanded picker */}
                {isOpen && (
                  <div className="px-6 pb-5 pt-1 bg-pit">
                    {/* keyword */}
                    <div className="flex items-center gap-3 mb-4">
                      <label
                        htmlFor={`kw-${group.key}`}
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust shrink-0"
                      >
                        Regla si contiene
                      </label>
                      <input
                        id={`kw-${group.key}`}
                        value={keyword}
                        onChange={(e) =>
                          setKeywords((k) => ({ ...k, [group.key]: e.target.value }))
                        }
                        className="flex-1 max-w-sm bg-void border border-wall focus:border-fog px-2.5 py-1 font-mono text-[11px] text-stone outline-none transition-colors"
                      />
                    </div>

                    {/* categories */}
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.filter((c) => c !== 'otros').map((category) => {
                        const color = categoryColor(category)
                        return (
                          <button
                            key={category}
                            onClick={() => classify.mutate({ group, category })}
                            disabled={isPending || !keyword.trim()}
                            className="inline-flex items-center gap-2 px-3 py-1.5 border border-wall hover:border-fog font-mono text-[11px] text-fog hover:text-stone transition-colors disabled:opacity-40"
                            style={{ backgroundColor: `${color}0D` }}
                          >
                            <span style={{ color }}>
                              <CategoryIcon category={category} className="w-4 h-4" />
                            </span>
                            {categoryLabel(category)}
                          </button>
                        )
                      })}
                    </div>

                    <p className="font-mono text-[10px] text-dust mt-3">
                      Se aplicará a los {group.count} movimientos del grupo y a los futuros que
                      coincidan.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
