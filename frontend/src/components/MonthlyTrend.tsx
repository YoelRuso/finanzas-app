import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts'
import { api, type Account } from '../api'
import { monthRange } from '../month'
import Section from './Section'

interface Props {
  accounts: Account[]
  month: Date
  /** Si viene, la gráfica es solo de esa cuenta. */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-shell border border-wall px-3 py-2 font-mono text-xs shadow-lg">
      <p className="text-fog mb-1">{label}</p>
      <p className="text-stone">{fmt.format(payload[0].value)}</p>
    </div>
  )
}

export default function MonthlyTrend({
  accounts,
  month,
  accountId,
}: Props) {
  /** Día señalado en el gráfico, para el contador de la cabecera. */
  const [hoveredDay, setHoveredDay] = useState<{ day: string; gasto: number } | null>(null)
  const range = monthRange(month)
  const { key, dateFrom, dateTo, label: monthLabel, daysInMonth, elapsedDays } = range

  const { data } = useQuery({
    // La cuenta forma parte de la clave: si no, al pasar de una cuenta a
    // otra React Query serviría los datos de la anterior.
    queryKey: ['transactions', 'monthly', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getTransactions({ dateFrom, dateTo, limit: 5000, accountId }),
    enabled: accounts.length > 0,
  })

  const dailyData = useMemo(() => {
    const txs = data?.transactions ?? []
    if (txs.length === 0) return []

    // group debits by day
    const byDay: Record<string, number> = {}
    for (const tx of txs) {
      if (tx.amount >= 0) continue // skip income
      if (tx.isTransfer) continue // mover dinero a otra cuenta propia no es gasto
      const day = tx.date.split('T')[0]
      byDay[day] = (byDay[day] ?? 0) + Math.abs(tx.amount)
    }

    // fill all days of the month
    const result = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${key}-${String(d).padStart(2, '0')}`
      // En un mes ya cerrado no hay días futuros.
      const isFuture = d > elapsedDays
      result.push({
        day: String(d),
        gasto: isFuture ? 0 : Math.round((byDay[dateStr] ?? 0) * 100) / 100,
        isFuture,
      })
    }
    return result
  }, [data, key, daysInMonth, elapsedDays])

  if (accounts.length === 0 || dailyData.length === 0) return null

  const totalSpent = dailyData.reduce((s, d) => s + d.gasto, 0)
  const avgDaily = elapsedDays > 0 ? totalSpent / elapsedDays : 0

  return (
    <Section
      id="evolucion"
      title="Evolución de gasto"
      subtitle={monthLabel}
      actions={
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <span className="font-mono text-[10px] text-dust block">media diaria</span>
            <span className="font-mono text-sm text-fog">{fmt.format(avgDaily)}</span>
          </div>
          {/*
            Al pasar por una barra, el acumulado del mes cede el sitio al día
            señalado: el dato aparece donde ya estabas mirando, sin perseguir
            el tooltip por el gráfico.
          */}
          <div className="text-right min-w-[5.5rem]">
            <span className="font-mono text-[10px] text-dust block">
              {hoveredDay ? `día ${hoveredDay.day}` : 'acumulado'}
            </span>
            <span
              className={`font-mono text-sm ${hoveredDay ? 'text-brass' : 'text-stone'}`}
            >
              {fmt.format(hoveredDay ? hoveredDay.gasto : totalSpent)}
            </span>
          </div>
        </div>
      }
    >
      {/* chart */}
      <div className="px-4 pt-6 pb-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={dailyData}
            barCategoryGap="15%"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onMouseMove={(state: any) => {
              const point = state?.activePayload?.[0]?.payload
              setHoveredDay(point ? { day: String(point.day), gasto: point.gasto } : null)
            }}
            onMouseLeave={() => setHoveredDay(null)}
          >
            <CartesianGrid
              vertical={false}
              stroke="#31333F"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6F6F82', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
              interval={4}
            />
            <YAxis
              hide
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(49, 51, 63, 0.45)' }} />
            <Bar
              dataKey="gasto"
              radius={[3, 3, 0, 0]}
              fill="#D4B87A"
              fillOpacity={0.7}
              activeBar={{ fillOpacity: 1 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  )
}
