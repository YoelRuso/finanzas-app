import { useState } from 'react'
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type BankSession, type AccountTotals } from '../api'
import { accountLabel } from '../account'
import { monthRange } from '../month'
import Section from './Section'

interface Props {
  sessions: BankSession[]
  /** Mes del dashboard: los ingresos y gastos de cada cuenta son los suyos. */
  month: Date
  /** Cuenta activa del dashboard, null = todas. */
  activeId?: string | null
  /** Pulsar una cuenta la pone activa; volver a pulsarla vuelve a todas. */
  onSelect?: (accountId: string | null) => void
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const fmtSigned = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  signDisplay: 'always',
})

const PREFERRED_TYPES = ['CLAV', 'ITBD', 'VALU', 'OPBD']

function bestBalance(balances: { balance_type: string; balance_amount: { amount: string } }[]): number {
  for (const type of PREFERRED_TYPES) {
    const b = balances.find((b) => b.balance_type === type)
    if (b) return parseFloat(b.balance_amount.amount)
  }
  if (balances.length > 0) return parseFloat(balances[0].balance_amount.amount)
  return 0
}

/** Una cifra del mes: etiqueta a la izquierda, número alineado a la derecha. */
function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="flex items-baseline justify-between gap-1 min-w-0">
      <span className="text-dust">{label}</span>
      <span className={`tabular-nums truncate ${tone}`}>{value}</span>
    </span>
  )
}

/**
 * Ficha de cuentas: saldo de cada una y, debajo, lo que ha entrado y salido
 * en el mes seleccionado. Es también el selector de cuenta permanente —
 * pulsar una filtra el dashboard entero— y donde se les pone nombre propio.
 */
export default function AccountBalances({ sessions, month, activeId = null, onSelect }: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [draftAlias, setDraftAlias] = useState('')

  const { dateFrom, dateTo } = monthRange(month)

  // Cada cuenta con el banco al que pertenece.
  const entries = sessions.flatMap((session) =>
    session.accounts.map((account) => ({ account, bank: session.aspspName }))
  )

  // Mismas queryKey que el hero: sale de caché, no añade peticiones.
  const balanceQueries = useQueries({
    queries: entries.map(({ account }) => ({
      queryKey: ['balances', account.uid],
      queryFn: () => api.getBalances(account.uid),
      staleTime: 5 * 60 * 1000,
    })),
  })

  // Ingresos, gastos y neto del mes, cuenta por cuenta.
  const { data: totalsData } = useQuery({
    queryKey: ['by-account', dateFrom, dateTo],
    queryFn: () => api.getByAccount(dateFrom, dateTo),
    enabled: entries.length > 0,
  })

  const totals = new Map<string, AccountTotals>(
    (totalsData?.accounts ?? []).map((row) => [row.accountId, row])
  )

  const saveAlias = useMutation({
    mutationFn: ({ uid, alias }: { uid: string; alias: string }) =>
      api.setAccountAlias(uid, alias),
    onSuccess: () => {
      setEditing(null)
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['by-account'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  if (entries.length === 0) return null

  const monthLabel = month.toLocaleDateString('es-ES', { month: 'long' })

  return (
    <Section
      title="Cuentas"
      subtitle={monthLabel}
      actions={<span className="font-mono text-[11px] text-dust">{entries.length}</span>}
    >
      <div>
        {entries.map(({ account, bank }, i) => {
          const query = balanceQueries[i]
          const amount = query.data ? bestBalance(query.data.balances) : null
          const row = totals.get(account.id)
          const active = activeId === account.id
          const moved = (row?.transferredIn ?? 0) + (row?.transferredOut ?? 0)

          return (
            <div
              key={account.uid}
              className={`group relative border-b border-wall last:border-b-0 border-l-2 transition-colors ${
                active ? 'border-l-brass bg-shell' : 'border-l-transparent'
              }`}
            >
              {/* Toda la ficha es el selector: pulsarla filtra el dashboard. */}
              <button
                onClick={() => onSelect?.(active ? null : account.id)}
                disabled={!onSelect || editing === account.uid}
                aria-current={active ? 'true' : undefined}
                title={
                  active ? 'Volver a todas las cuentas' : `Ver solo ${accountLabel(account)}`
                }
                className="w-full text-left px-5 py-3 enabled:hover:bg-shell/60 transition-colors"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-dust truncate">
                  {bank}
                </p>

                <div className="flex items-baseline justify-between gap-2 mt-1">
                  {editing === account.uid ? (
                    <input
                      autoFocus
                      value={draftAlias}
                      onChange={(e) => setDraftAlias(e.target.value)}
                      onBlur={() =>
                        saveAlias.mutate({ uid: account.uid, alias: draftAlias })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')
                          saveAlias.mutate({ uid: account.uid, alias: draftAlias })
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      placeholder="Nómina, Ahorro…"
                      className="bg-transparent border-b border-brass font-sans text-[13px] text-stone placeholder:text-dust outline-none min-w-0 flex-1"
                    />
                  ) : (
                    <span
                      className={`font-sans text-[13px] truncate ${
                        active ? 'text-brass' : 'text-fog'
                      }`}
                    >
                      {accountLabel(account)}
                    </span>
                  )}

                  <span
                    className={`font-mono text-sm tabular-nums shrink-0 ${
                      amount === null ? 'text-dust' : amount < 0 ? 'text-rust' : 'text-stone'
                    }`}
                  >
                    {query.isLoading ? (
                      <span className="animate-pulse">···</span>
                    ) : query.isError || amount === null ? (
                      '—'
                    ) : (
                      fmt.format(amount)
                    )}
                  </span>
                </div>

                {/* El mes de esta cuenta, en dos columnas para que quepa. */}
                {row ? (
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
                    <Stat label="ing." value={fmt.format(row.income)} tone="text-moss" />
                    <Stat label="gas." value={fmt.format(row.spent)} tone="text-rust" />
                    <Stat
                      label="neto"
                      value={fmtSigned.format(row.net)}
                      tone={row.net < 0 ? 'text-rust' : 'text-stone'}
                    />
                    <Stat label="mov." value={String(row.count)} tone="text-fog" />
                  </div>
                ) : (
                  <p className="mt-2 font-mono text-[10px] text-dust">
                    sin movimientos este mes
                  </p>
                )}

                {/* Los traspasos no son gasto ni ingreso: van aparte y en corto. */}
                {row && moved > 0 && (
                  <p
                    className="mt-1 font-mono text-[10px] text-dust truncate"
                    title={`${fmt.format(row.transferredOut)} salieron · ${fmt.format(
                      row.transferredIn
                    )} entraron — fuera de ingresos y gastos`}
                  >
                    ⇄ {fmt.format(row.transferredOut)} · {fmt.format(row.transferredIn)}
                  </p>
                )}
              </button>

              {/* Poner nombre propio a la cuenta, sin robarle el clic a la ficha. */}
              {editing !== account.uid && (
                <button
                  onClick={() => {
                    setEditing(account.uid)
                    setDraftAlias(account.alias ?? '')
                  }}
                  title="Poner nombre a esta cuenta"
                  aria-label={`Renombrar ${accountLabel(account)}`}
                  className="absolute top-2 right-3 px-1 font-mono text-[11px] text-dust opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-brass transition"
                >
                  ✎
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
