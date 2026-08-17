import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Account } from '../api'
import { CATEGORIES, categoryLabel, categoryColor } from '../categories'
import { accountLabel } from '../account'
import { monthRange } from '../month'
import Section from './Section'
import Badge from './Badge'
import CategoryIcon from './CategoryIcon'

interface Props {
  accounts: Account[]
  month: Date
  /** Si viene, solo los movimientos de esa cuenta. */
  accountId?: string
}

const fmtAmount = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  signDisplay: 'always',
})

const fmtDate = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' })

export default function TransactionList({
  accounts,
  month,
  accountId,
}: Props) {
  const queryClient = useQueryClient()
  const [openPicker, setOpenPicker] = useState<number | null>(null)
  const containerRef = useRef<HTMLElement>(null)

  const { dateFrom, dateTo, label: monthLabel, isCurrent } = monthRange(month)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getTransactions({ dateFrom, dateTo, limit: 500, accountId }),
    enabled: accounts.length > 0,
  })

  const transactions = data?.transactions ?? []

  // Con varias cuentas a la vista hace falta saber de cuál es cada movimiento;
  // dentro de una sola cuenta, repetirlo en cada línea sobra.
  const showAccount = !accountId && accounts.length > 1

  // Solo tiene sentido marcar traspasos si hay más de una cuenta conectada.
  // Dentro de la vista de una cuenta, `accounts` viene ya filtrado.
  const canMarkTransfer = accounts.length > 1 || Boolean(accountId)

  // Cierra el selector al hacer clic fuera o pulsar Escape.
  useEffect(() => {
    if (openPicker === null) return

    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpenPicker(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenPicker(null)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openPicker])

  const recategorize = useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      api.updateTransactionCategory(id, { category }),
    onSuccess: () => {
      setOpenPicker(null)
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['pending-groups'] })
      void queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })

  // Marcar o desmarcar un traspaso cambia gasto, ingreso y saldo del mes,
  // así que se invalida todo lo que sale de los movimientos.
  const toggleTransfer = useMutation({
    mutationFn: ({ id, isTransfer }: { id: number; isTransfer: boolean }) =>
      api.setTransfer(id, isTransfer),
    onSuccess: () => {
      for (const key of ['transactions', 'summary', 'months', 'by-account', 'pending-groups']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })

  return (
    <Section
      ref={containerRef}
      id="movimientos"
      title="Movimientos"
      subtitle={monthLabel}
      // El selector de categoría se abre hacia abajo y en las últimas filas
      // se sale del panel: si este recortara, lo cortaría por la mitad.
      allowOverflow
      actions={
        transactions.length > 0 ? (
          <span className="font-mono text-[11px] text-dust">
            {transactions.length} movimientos
          </span>
        ) : undefined
      }
    >
      {/* empty: no accounts */}
      {accounts.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">Conecta un banco para ver movimientos</p>
        </div>
      )}

      {/* loading */}
      {accounts.length > 0 && isLoading && (
        <div className="px-6 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex justify-between py-3.5 border-b border-wall animate-pulse">
              <div className="h-3.5 bg-wall rounded w-40" />
              <div className="h-3.5 bg-wall rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {/* no transactions */}
      {accounts.length > 0 && !isLoading && transactions.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">
            {isCurrent ? 'Sin movimientos — pulsa Sincronizar' : 'Sin movimientos en este mes'}
          </p>
        </div>
      )}

      {/* list */}
      {transactions.length > 0 && (
        <div>
          {transactions.map((tx) => {
            const isDebit = tx.amount < 0
            const date = new Date(tx.date)
            const dateStr = fmtDate.format(date).toUpperCase()
            const catLabel = categoryLabel(tx.category)
            const catColor = categoryColor(tx.category)
            const isOpen = openPicker === tx.id

            return (
              <div
                key={tx.id}
                // Este panel no recorta, así que la última fila redondea su
                // propio fondo para no cuadrar las esquinas de abajo.
                className="flex items-center gap-3 px-6 py-3 border-b border-wall last:border-b-0 last:rounded-b-[15px] hover:bg-shell transition-colors"
              >
                {/* date */}
                <span className="font-mono text-[11px] text-dust shrink-0 w-14">
                  {dateStr}
                </span>

                {/* description */}
                <div className="flex-1 min-w-0">
                  <p className="font-sans text-sm text-stone truncate">{tx.description}</p>
                  {showAccount && (
                    <p className="font-mono text-[10px] text-dust truncate">
                      {accountLabel(tx.account)}
                    </p>
                  )}
                </div>

                {/* traspaso: ni gasto ni ingreso, solo dinero cambiando de cuenta */}
                {tx.isTransfer && (
                  <button
                    onClick={() => toggleTransfer.mutate({ id: tx.id, isTransfer: false })}
                    disabled={toggleTransfer.isPending}
                    title="No es un traspaso — volver a contarlo como gasto o ingreso"
                    className="hidden md:block shrink-0 opacity-90 hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    <Badge tone="neutral" dot={false}>
                      ⇄ Traspaso
                    </Badge>
                  </button>
                )}

                {/* category tag — clic para cambiar */}
                <div className={`relative shrink-0 ${tx.isTransfer ? 'hidden' : 'hidden md:block'}`}>
                  <button
                    onClick={() => setOpenPicker(isOpen ? null : tx.id)}
                    disabled={recategorize.isPending}
                    title="Cambiar categoría"
                    className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded text-[10px] font-mono tracking-wide border border-transparent hover:border-wall transition-colors disabled:opacity-50"
                    style={{ backgroundColor: `${catColor}15`, color: catColor }}
                  >
                    <CategoryIcon category={tx.category} className="w-3.5 h-3.5" />
                    {catLabel}
                    {tx.categoryManual && <span className="opacity-60">✓</span>}
                  </button>

                  {isOpen && (
                    <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-shell border border-wall shadow-xl py-1">
                      {CATEGORIES.map((category) => {
                        const color = categoryColor(category)
                        const active = tx.category === category
                        return (
                          <button
                            key={category}
                            onClick={() => recategorize.mutate({ id: tx.id, category })}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] text-left transition-colors ${
                              active ? 'bg-pit text-stone' : 'text-fog hover:bg-pit hover:text-stone'
                            }`}
                          >
                            <span style={{ color }} className="shrink-0">
                              <CategoryIcon category={category} className="w-3.5 h-3.5" />
                            </span>
                            {categoryLabel(category)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* marcar como traspaso a mano, cuando el detector no lo pilló */}
                {!tx.isTransfer && canMarkTransfer && (
                  <button
                    onClick={() => toggleTransfer.mutate({ id: tx.id, isTransfer: true })}
                    disabled={toggleTransfer.isPending}
                    title="Marcar como traspaso entre cuentas propias"
                    className="hidden md:block shrink-0 font-mono text-sm text-dust hover:text-fog transition-colors disabled:opacity-50"
                  >
                    ⇄
                  </button>
                )}

                {/* amount — el traspaso se pinta apagado: no mueve el patrimonio */}
                <span
                  className={`font-mono text-sm tabular-nums shrink-0 w-24 text-right ${
                    tx.isTransfer ? 'text-dust' : isDebit ? 'text-rust' : 'text-moss'
                  }`}
                >
                  {fmtAmount.format(tx.amount)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
