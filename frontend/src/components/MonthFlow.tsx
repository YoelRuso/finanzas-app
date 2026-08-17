import { useQuery } from '@tanstack/react-query'
import { api, type Account } from '../api'
import { monthKey, monthRange } from '../month'
import Section from './Section'

interface Props {
  accounts: Account[]
  month: Date
  /** Si viene, el flujo es solo el de esa cuenta. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

/**
 * Lo que entra, lo que sale y lo que queda del mes.
 *
 * El resto del panel solo habla de gasto, así que un mes con 21 € de ingresos
 * y otro con 594 € se leían igual. El dato ya venía en el resumen mensual
 * (que excluye los traspasos entre cuentas propias), solo que no se enseñaba
 * en ninguna parte.
 */
export default function MonthFlow({ accounts, month, accountId }: Props) {
  const { data } = useQuery({
    queryKey: ['months', accountId ?? 'all'],
    queryFn: () => api.getMonths(accountId),
    enabled: accounts.length > 0,
  })

  const { label: monthLabel } = monthRange(month)
  const summary = data?.months.find((m) => m.month === monthKey(month))

  if (accounts.length === 0 || !summary) return null
  if (summary.income === 0 && summary.spent === 0) return null

  const income = summary.income
  const spent = summary.spent
  const left = Math.round((income - spent) * 100) / 100
  const positive = left >= 0

  // La barra mide cuánto de lo que entró se ha ido. Sin ingresos no hay nada
  // que consumir: se pinta llena, que es exactamente lo que está pasando.
  const consumed = income > 0 ? Math.min(100, (spent / income) * 100) : 100
  const savedPct = income > 0 && positive ? Math.round((left / income) * 100) : null

  return (
    <Section id="flujo" title="Entra y sale" subtitle={monthLabel}>
      <div className="px-6 py-6">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1">
              Entra
            </p>
            <p className="font-display text-2xl text-moss tabular-nums">{fmt.format(income)}</p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1">
              Sale
            </p>
            <p className="font-display text-2xl text-rust tabular-nums">{fmt.format(spent)}</p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1">
              Queda
            </p>
            <p
              className={`font-display text-2xl tabular-nums ${
                positive ? 'text-stone' : 'text-rust'
              }`}
            >
              {positive && '+'}
              {fmt.format(left)}
            </p>
          </div>

          {savedPct !== null && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1">
                Ahorrado
              </p>
              <p className="font-display text-2xl text-fog tabular-nums">{savedPct}%</p>
            </div>
          )}
        </div>

        {/* Cuánto de lo que entró se ha ido ya. */}
        <div className="mt-5 h-2 bg-wall/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              positive ? 'bg-moss' : 'bg-rust'
            }`}
            style={{ width: `${consumed}%` }}
          />
        </div>

        <p className="font-mono text-[11px] text-dust mt-3 leading-relaxed">
          {income === 0
            ? `Este mes no ha entrado nada y han salido ${fmt.format(spent)}.`
            : positive
              ? `De los ${fmt.format(income)} que entraron, ${fmt.format(spent)} se han ido.`
              : `Han salido ${fmt.format(Math.abs(left))} más de lo que entró.`}
        </p>
      </div>
    </Section>
  )
}
