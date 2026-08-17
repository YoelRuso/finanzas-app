import { useQuery } from '@tanstack/react-query'
import { api, type Account } from '../api'
import Section from './Section'

interface Props {
  accounts: Account[]
  /** Cuenta activa; sin ella, los últimos de todas juntas. */
  accountId?: string
}

/** Cuántos caben en la ficha sin convertirla en un listado. */
const HOW_MANY = 4

const fmtAmount = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  signDisplay: 'always',
})

const fmtDate = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' })

/**
 * Los últimos movimientos, para comprobar de un vistazo que ha entrado la
 * nómina o que el cargo de ayer está donde toca, sin bajar hasta la sección
 * de Movimientos. No depende del mes elegido: son los más recientes que hay.
 */
export default function RecentTransactions({ accounts, accountId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', 'recent', accountId ?? 'all'],
    queryFn: () => api.getTransactions({ limit: HOW_MANY, accountId }),
    enabled: accounts.length > 0,
  })

  if (accounts.length === 0) return null

  const transactions = data?.transactions ?? []

  return (
    <Section
      title="Últimos"
      subtitle="recientes"
      actions={
        <a
          href="#movimientos"
          className="font-mono text-[11px] text-fog hover:text-stone transition-colors"
        >
          ver todos
        </a>
      }
    >
      {isLoading && (
        <div className="px-5 py-4 space-y-3">
          {Array.from({ length: HOW_MANY }).map((_, i) => (
            <div key={i} className="h-3 bg-wall/40 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && transactions.length === 0 && (
        <p className="px-5 py-4 font-mono text-[11px] text-dust">Sin movimientos</p>
      )}

      {!isLoading &&
        transactions.map((tx) => (
          <div key={tx.id} className="px-5 py-2.5 border-b border-wall last:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dust shrink-0">
                {fmtDate.format(new Date(tx.date))}
              </span>
              {/* Un traspaso no es gasto: se marca y se apaga para que no
                  se lea como dinero que sale del bolsillo. */}
              <span
                className={`font-mono text-[13px] tabular-nums shrink-0 ${
                  tx.isTransfer ? 'text-dust' : tx.amount < 0 ? 'text-rust' : 'text-moss'
                }`}
                title={tx.isTransfer ? 'Traspaso entre cuentas propias' : undefined}
              >
                {tx.isTransfer && '⇄ '}
                {fmtAmount.format(tx.amount)}
              </span>
            </div>
            <p className="mt-0.5 font-sans text-[12px] text-fog truncate" title={tx.description}>
              {tx.description}
            </p>
          </div>
        ))}
    </Section>
  )
}
