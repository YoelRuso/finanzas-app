import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Account } from '../api'
import { CATEGORIES, categoryLabel, categoryColor } from '../categories'
import { accountLabel } from '../account'
import { conceptLabel } from '../description'
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

/** Movimientos que se pintan de entrada, y cuántos añade cada «ver más». */
const PAGE = 15

/** Para que "alimentacion" encuentre "Alimentación". */
function normalize(text: string): string {
  // NFD separa la tilde de la letra y el rango borra las tildes sueltas.
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function TransactionList({
  accounts,
  month,
  accountId,
}: Props) {
  const queryClient = useQueryClient()
  const [openPicker, setOpenPicker] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  /** Cuántos se enseñan ahora mismo. Crece con «ver más». */
  const [visible, setVisible] = useState(PAGE)
  const containerRef = useRef<HTMLElement>(null)

  const { dateFrom, dateTo, label: monthLabel, isCurrent } = monthRange(month)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getTransactions({ dateFrom, dateTo, limit: 500, accountId }),
    enabled: accounts.length > 0,
  })

  const transactions = data?.transactions ?? []

  // La búsqueda mira el concepto y la categoría: "mercadona" y "alimentación"
  // llevan los dos a la misma compra.
  const needle = normalize(search.trim())
  const filtered = needle
    ? transactions.filter(
        (tx) =>
          normalize(tx.description).includes(needle) ||
          normalize(categoryLabel(tx.category)).includes(needle)
      )
    : transactions

  const shown = filtered.slice(0, visible)
  const hasMore = filtered.length > visible

  // Cambiar de mes, de cuenta o de búsqueda vuelve a empezar por arriba.
  useEffect(() => setVisible(PAGE), [dateFrom, accountId, search])

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
          <>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar en los movimientos"
              className="w-28 sm:w-44 bg-void border border-wall focus:border-fog px-2.5 py-1 font-mono text-[11px] text-stone placeholder:text-dust outline-none transition-colors"
            />
            <span className="font-mono text-[11px] text-dust tabular-nums">
              {needle
                ? `${filtered.length} de ${transactions.length}`
                : `${transactions.length} movimientos`}
            </span>
          </>
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

      {/* la búsqueda no encuentra nada */}
      {transactions.length > 0 && filtered.length === 0 && (
        <div className="px-6 py-12 text-center">
          <p className="font-mono text-sm text-dust">
            Nada coincide con «{search.trim()}»
          </p>
        </div>
      )}

      {/* list */}
      {shown.length > 0 && (
        <div>
          {shown.map((tx) => {
            const isDebit = tx.amount < 0
            const date = new Date(tx.date)
            const dateStr = fmtDate.format(date).toUpperCase()
            const catLabel = categoryLabel(tx.category)
            const catColor = categoryColor(tx.category)
            const isOpen = openPicker === tx.id

            return (
              <div
                key={tx.id}
                // Este panel no recorta, así que quien cierre la lista
                // redondea su propio fondo: la última fila, o el «ver más».
                className={`flex items-center gap-3 px-6 py-3 border-b border-wall last:border-b-0 hover:bg-shell transition-colors ${
                  hasMore ? '' : 'last:rounded-b-[15px]'
                }`}
              >
                {/* date */}
                <span className="font-mono text-[11px] text-dust shrink-0 w-14">
                  {dateStr}
                </span>

                {/* description */}
                <div className="flex-1 min-w-0">
                  {/*
                    En el móvil el concepto cabe en ~150 px: cortado a una
                    línea, «Pago en MERCA…» no distingue una compra de otra,
                    y con los bizums es peor. Se le dejan dos líneas, que es
                    donde ya se lee el comercio entero.
                  */}
                  <p
                    className="font-sans text-sm text-stone line-clamp-2 sm:line-clamp-none sm:truncate"
                    title={tx.description}
                  >
                    {conceptLabel(tx.description)}
                  </p>
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

          {/* La lista entera medía más de un tercio de la página. */}
          {hasMore && (
            <button
              onClick={() => setVisible((v) => v + PAGE)}
              className="w-full px-6 py-3 border-t border-wall rounded-b-[15px] font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone hover:bg-shell transition-colors"
            >
              Ver más — quedan {filtered.length - visible}
            </button>
          )}
        </div>
      )}
    </Section>
  )
}
