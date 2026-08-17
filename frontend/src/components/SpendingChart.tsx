import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { api, type Account } from '../api'
import { CATEGORY_LABELS, categoryColor as getColor } from '../categories'
import { accountLabel } from '../account'
import { monthRange } from '../month'
import Section from './Section'
import Badge from './Badge'
import CategoryIcon from './CategoryIcon'

interface Props {
  accounts: Account[]
  month: Date
  /** Si viene, el gasto es solo el de esa cuenta. */
  accountId?: string
  /** El apartado por cuenta ya tiene su propio índice lateral. */
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="bg-shell border border-wall px-3 py-2 font-mono text-xs shadow-lg">
      <span className="text-stone">{CATEGORY_LABELS[name] ?? name}</span>
      <span className="text-fog ml-2">{fmt.format(value)}</span>
    </div>
  )
}

export default function SpendingChart({
  accounts,
  month,
  accountId,
}: Props) {
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)

  const { dateFrom, dateTo, key: monthKey, label: monthLabel } = monthRange(month)

  const { data, isLoading } = useQuery({
    queryKey: ['summary', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getSummary(dateFrom, dateTo, accountId),
    enabled: accounts.length > 0,
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncing(true)
      setSyncMsg('')
      let total = 0
      // Que falle una cuenta no debe tirar las demás ni hacer creer que no
      // se importó nada: se sincronizan todas y se dice cuál falló.
      const failed: string[] = []
      // Cuentas a las que el banco solo dio los últimos 90 días.
      const limited: string[] = []
      for (const acc of accounts) {
        try {
          const res = await api.syncAccount(acc.uid)
          total += res.synced
          if (res.limitedToRecent) limited.push(accountLabel(acc))
        } catch {
          failed.push(accountLabel(acc))
        }
      }
      return { total, failed, limited }
    },
    onSuccess: ({ total, failed, limited }) => {
      setSyncMsg(
        failed.length > 0
          ? `${total} importados · falló ${failed.join(', ')}`
          : limited.length > 0
            ? `${total} importados · ${limited.join(', ')}: solo 90 días`
            : `${total} movimientos importados`
      )
      for (const key of ['summary', 'transactions', 'balances', 'months', 'pending-groups', 'by-account', 'receipts']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      setSyncing(false)
    },
    onError: () => {
      setSyncMsg('Error al sincronizar')
      setSyncing(false)
    },
  })

  // Los ingresos del mes vienen del resumen mensual (ya cacheado por el hero
  // y el selector), y sirven para avisar si el gasto se los ha comido.
  const { data: monthsData } = useQuery({
    queryKey: ['months', accountId ?? 'all'],
    queryFn: () => api.getMonths(accountId),
  })

  const summary = data?.summary ?? []
  const grandTotal = summary.reduce((s, c) => s + c.total, 0)

  const income = monthsData?.months.find((m) => m.month === monthKey)?.income ?? 0
  const overspent = income > 0 && grandTotal > income

  /** Categoría señalada, venga del donut o de la tabla. */
  const hoveredCat = summary.find((c) => c.category === hovered) ?? null

  return (
    <Section
      id="gasto"
      title="Gasto por categoría"
      subtitle={monthLabel}
      actions={
        <>
          {syncMsg && (
            <span className="font-mono text-[11px] text-moss">{syncMsg}</span>
          )}
          {accounts.length > 0 && (
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncing}
              className="font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone disabled:text-dust transition-colors border-b border-transparent hover:border-fog disabled:border-transparent pb-px"
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          )}
        </>
      }
    >
      {/* empty / loading states */}
      {accounts.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">Conecta un banco para ver tus gastos</p>
        </div>
      )}

      {accounts.length > 0 && isLoading && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust animate-pulse">Cargando…</p>
        </div>
      )}

      {accounts.length > 0 && !isLoading && summary.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">
            {monthRange(month).isCurrent
              ? 'Sin movimientos este mes — pulsa Sincronizar'
              : 'Sin movimientos en este mes'}
          </p>
        </div>
      )}

      {/* donut + category list */}
      {summary.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] items-start">
          {/* donut */}
          <div className="flex flex-col items-center justify-center py-8 px-6">
            <div className="relative w-52 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={85}
                    paddingAngle={3}
                    stroke="none"
                    onMouseEnter={(_, i) => setHovered(summary[i].category)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {summary.map((entry) => (
                      <Cell
                        key={entry.category}
                        fill={getColor(entry.category)}
                        opacity={hovered === null || hovered === entry.category ? 1 : 0.25}
                        style={{ transition: 'opacity 0.2s' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/*
                El centro del donut es el sitio donde ya estás mirando, así
                que es donde se responde al hover: en reposo da el total del
                mes, y al señalar una categoría (aquí o en la tabla de al
                lado) se convierte en la ficha de esa categoría.
              */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-10 text-center">
                {hoveredCat ? (
                  <>
                    <span
                      className="font-mono text-xl font-light tabular-nums"
                      style={{ color: getColor(hoveredCat.category) }}
                    >
                      {fmt.format(hoveredCat.total)}
                    </span>
                    <span className="font-sans text-[11px] text-fog mt-1 leading-tight">
                      {CATEGORY_LABELS[hoveredCat.category] ?? hoveredCat.category}
                    </span>
                    <span className="font-mono text-[10px] text-dust mt-0.5 tabular-nums">
                      {((hoveredCat.total / grandTotal) * 100).toFixed(0)}% del mes
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-xl font-light text-stone tabular-nums">
                      {fmt.format(grandTotal)}
                    </span>
                    <span className="font-mono text-[10px] text-dust mt-1 tracking-wide">
                      total
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* category list */}
          <div className="border-l border-wall">
            {summary.map((cat) => {
              const share = (cat.total / grandTotal) * 100
              const isHovered = hovered === cat.category
              return (
                <div
                  key={cat.category}
                  // La fila señalada se marca con un filo del color de su
                  // porción; las demás se apagan, igual que en el donut, para
                  // que quede claro que tabla y gráfico son lo mismo.
                  className={`flex items-center gap-4 px-6 py-3.5 border-b border-wall transition-all duration-200 cursor-default ${
                    isHovered ? 'bg-pit' : hovered !== null ? 'opacity-40' : 'hover:bg-shell'
                  }`}
                  style={
                    isHovered
                      ? { boxShadow: `inset 3px 0 0 0 ${getColor(cat.category)}` }
                      : undefined
                  }
                  onMouseEnter={() => setHovered(cat.category)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* icono de categoría */}
                  <span
                    className="w-7 h-7 shrink-0 flex items-center justify-center rounded"
                    style={{
                      backgroundColor: `${getColor(cat.category)}1A`,
                      color: getColor(cat.category),
                    }}
                  >
                    <CategoryIcon category={cat.category} className="w-4 h-4" />
                  </span>
                  {/* name */}
                  <span className="font-sans text-sm text-stone flex-1">
                    {CATEGORY_LABELS[cat.category] ?? cat.category}
                  </span>
                  {/* percentage bar */}
                  <div className="hidden sm:block w-28 h-2.5 bg-wall/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${share}%`,
                        backgroundColor: getColor(cat.category),
                        opacity: isHovered ? 1 : 0.8,
                      }}
                    />
                  </div>
                  {/* percentage */}
                  <span className="font-mono text-xs text-dust w-10 text-right">
                    {share.toFixed(0)}%
                  </span>
                  {/* amount */}
                  <span className="font-mono text-sm text-fog w-20 text-right tabular-nums">
                    {fmt.format(cat.total)}
                  </span>
                </div>
              )
            })}
            {/* total row */}
            <div className="flex items-center gap-4 px-6 py-3.5 bg-pit/50">
              <span className="w-7 shrink-0" />
              <span className="font-sans text-sm text-fog flex-1 flex items-center gap-2.5 flex-wrap">
                Total del mes
                {overspent && (
                  <Badge
                    tone="alert"
                    title={`Has gastado más de lo que has ingresado este mes (${fmt.format(income)})`}
                  >
                    Supera los {fmt.format(income)} de ingresos
                  </Badge>
                )}
              </span>
              <div className="hidden sm:block w-28" />
              <span className="w-10" />
              <span
                className={`font-mono text-sm w-20 text-right tabular-nums font-medium ${
                  overspent ? 'text-rust' : 'text-stone'
                }`}
              >
                {fmt.format(grandTotal)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}
