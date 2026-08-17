import { useQueries, useQuery } from '@tanstack/react-query'
import { api, type Account } from '../api'
import { monthKey, monthKeyToDate, addMonths } from '../month'
import { accountLabel } from '../account'
import Sparkline from './Sparkline'

interface Props {
  /** Cuentas que suman el saldo: una sola si hay cuenta activa, o todas. */
  accounts: Account[]
  /** Mes seleccionado en el dashboard: gobierna la comparativa de gasto. */
  month: Date
  /** Cuenta activa, para que el histórico de gasto sea también el suyo. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const fmtShort = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
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

/** "julio", "agosto"… para la etiqueta de comparación. */
function monthName(key: string): string {
  return monthKeyToDate(key).toLocaleDateString('es-ES', { month: 'long' })
}

export default function HeroBalance({ accounts, month, accountId }: Props) {
  const balanceQueries = useQueries({
    queries: accounts.map((acc) => ({
      queryKey: ['balances', acc.uid],
      queryFn: () => api.getBalances(acc.uid),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const { data: monthsData } = useQuery({
    queryKey: ['months', accountId ?? 'all'],
    queryFn: () => api.getMonths(accountId),
  })

  const hasAccounts = accounts.length > 0
  const allLoaded = balanceQueries.every((q) => !q.isLoading)
  const anyError = balanceQueries.some((q) => q.isError)

  const total = balanceQueries.reduce((sum, q) => {
    if (!q.data) return sum
    return sum + bestBalance(q.data.balances)
  }, 0)

  const balanceReady = hasAccounts && allLoaded && !anyError
  const formattedTotal = balanceReady ? fmt.format(total) : '——,—— €'
  const isLoading = hasAccounts && !allLoaded

  // getMonths devuelve los meses de más reciente a más antiguo.
  const months = monthsData?.months ?? []
  const recent = months.slice(0, 6).reverse()
  const sparkValues = recent.map((m) => m.spent)

  // Comparativa del mes seleccionado con el anterior.
  const selectedKey = monthKey(month)
  const previousKey = monthKey(addMonths(month, -1))
  const selected = months.find((m) => m.month === selectedKey)
  const previous = months.find((m) => m.month === previousKey)
  const delta =
    selected && previous && previous.spent > 0
      ? ((selected.spent - previous.spent) / previous.spent) * 100
      : null
  // Gastar menos que el mes anterior es la buena noticia.
  const spendingDown = delta !== null && delta < 0

  return (
    <section id="saldo" className="panel scroll-mt-20 px-6 sm:px-8 py-8 md:py-10">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        {/* ── Saldo ─────────────────────────────────────── */}
        <div className="min-w-0">
          <p
            className={`
              font-mono font-light leading-none tracking-tight select-all tabular-nums
              text-[clamp(2.6rem,7vw,5rem)]
              transition-colors duration-700
              ${balanceReady ? 'text-brass' : 'text-dust'}
            `}
          >
            {isLoading ? (
              <span className="animate-pulse text-dust">···,·· €</span>
            ) : (
              formattedTotal
            )}
          </p>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <p className="font-mono text-xs text-fog tracking-wide">
              {/* Con una cuenta activa ya no es un total: es el saldo de esa. */}
              {accountId ? 'saldo' : 'saldo total'}
            </p>
            {hasAccounts && (
              <>
                <span className="text-wall text-xs">·</span>
                <p className="font-mono text-xs text-dust truncate max-w-[16rem]">
                  {accountId
                    ? accountLabel(accounts[0])
                    : `${accounts.length} ${accounts.length === 1 ? 'cuenta' : 'cuentas'}`}
                </p>
              </>
            )}
            {anyError && (
              <>
                <span className="text-wall text-xs">·</span>
                <p className="font-mono text-xs text-rust">error al cargar saldo</p>
              </>
            )}
          </div>
        </div>

        {/* ── Evolución del gasto ───────────────────────── */}
        {sparkValues.length >= 2 && (
          <div className="shrink-0 md:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-2">
              Gasto · últimos {sparkValues.length} meses
            </p>

            <Sparkline values={sparkValues} className="md:ml-auto" />

            <div className="mt-2 flex items-center gap-2 md:justify-end">
              {delta !== null ? (
                <>
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      spendingDown ? 'text-moss' : 'text-rust'
                    }`}
                  >
                    {spendingDown ? '↓' : '↑'} {delta > 0 ? '+' : ''}
                    {delta.toFixed(0)}%
                  </span>
                  <span className="font-mono text-[11px] text-dust">
                    vs. {monthName(previousKey)}
                  </span>
                </>
              ) : (
                <span className="font-mono text-[11px] text-dust">
                  {selected ? fmtShort.format(selected.spent) : 'sin datos del mes'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
