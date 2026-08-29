import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
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

/** Lunes primero, como el calendario español. */
const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** Plural para el tooltip: "los martes", pero "los sábados". */
const WEEKDAY_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']

/** Índice 0-6 con el lunes al principio (getDay() pone el domingo el primero). */
function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

interface Point {
  /** Etiqueta del eje X: el número del día, o "sáb". */
  day: string
  /** Lo que pinta la barra: gasto del día, o media de ese día de la semana. */
  gasto: number
  /** Texto del tooltip: "sáb 14", o "sábados". */
  label: string
  /** Segunda línea del tooltip, solo en la vista por día de la semana. */
  detail?: string
}

type View = 'dias' | 'semana'

const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: 'dias', label: 'días', hint: 'Gasto de cada día del mes' },
  { value: 'semana', label: 'semana', hint: 'Media por día de la semana' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point: Point = payload[0].payload
  return (
    <div className="bg-shell border border-wall px-3 py-2 font-mono text-xs shadow-lg">
      <p className="text-fog mb-1">{point.label}</p>
      <p className="text-stone">{fmt.format(point.gasto)}</p>
      {point.detail && <p className="text-dust text-[10px] mt-1">{point.detail}</p>}
    </div>
  )
}

export default function MonthlyTrend({
  accounts,
  month,
  accountId,
}: Props) {
  /** Barra señalada en el gráfico, para el contador de la cabecera. */
  const [hovered, setHovered] = useState<Point | null>(null)
  const [view, setView] = useState<View>('dias')
  const range = monthRange(month)
  const { key, dateFrom, dateTo, label: monthLabel, daysInMonth, elapsedDays } = range

  const { data } = useQuery({
    // La cuenta forma parte de la clave: si no, al pasar de una cuenta a
    // otra React Query serviría los datos de la anterior.
    queryKey: ['transactions', 'monthly', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getTransactions({ dateFrom, dateTo, limit: 5000, accountId }),
    enabled: accounts.length > 0,
  })

  const dailyData = useMemo<Point[]>(() => {
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
    const [year, monthNum] = key.split('-').map(Number)
    const result: Point[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${key}-${String(d).padStart(2, '0')}`
      // En un mes ya cerrado no hay días futuros.
      const isFuture = d > elapsedDays
      const weekday = WEEKDAYS[weekdayIndex(new Date(year, monthNum - 1, d))]
      result.push({
        day: String(d),
        gasto: isFuture ? 0 : Math.round((byDay[dateStr] ?? 0) * 100) / 100,
        label: `${weekday} ${d}`,
      })
    }
    return result
  }, [data, key, daysInMonth, elapsedDays])

  /**
   * Media de gasto por día de la semana. Media y no total: los meses traen
   * cuatro o cinco lunes, así que sumar premiaría al día que más veces cae.
   * Los días futuros no cuentan ni en el reparto ni en el divisor.
   */
  const weekdayData = useMemo<Point[]>(() => {
    if (dailyData.length === 0) return []

    const [year, monthNum] = key.split('-').map(Number)
    const totals = new Array<number>(7).fill(0)
    const counts = new Array<number>(7).fill(0)
    for (let d = 1; d <= Math.min(elapsedDays, daysInMonth); d++) {
      const i = weekdayIndex(new Date(year, monthNum - 1, d))
      totals[i] += dailyData[d - 1].gasto
      counts[i] += 1
    }

    return WEEKDAYS.map((name, i) => ({
      day: name,
      gasto: counts[i] > 0 ? Math.round((totals[i] / counts[i]) * 100) / 100 : 0,
      label: WEEKDAY_PLURAL[i],
      detail: `${fmt.format(totals[i])} en ${counts[i]} ${counts[i] === 1 ? 'día' : 'días'}`,
    }))
  }, [dailyData, key, daysInMonth, elapsedDays])

  if (accounts.length === 0 || dailyData.length === 0) return null

  const byWeekday = view === 'semana'
  const chartData = byWeekday ? weekdayData : dailyData

  /**
   * Punto señalado dentro del gráfico. Recharts 3 ya no manda `activePayload`
   * a los manejadores del gráfico —solo el índice, y como cadena—, así que el
   * dato se busca en los datos que se le pasaron. Antes se leía el payload y
   * el resultado era siempre `null`: la cabecera se quedaba en el acumulado
   * por mucho que se pasara por encima de las barras.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pointAt(state: any): Point | null {
    const raw = state?.activeTooltipIndex
    if (raw === null || raw === undefined) return null
    const index = Number(raw)
    return Number.isInteger(index) && index >= 0 ? (chartData[index] ?? null) : null
  }
  const totalSpent = dailyData.reduce((s, d) => s + d.gasto, 0)
  const avgDaily = elapsedDays > 0 ? totalSpent / elapsedDays : 0
  // El día de la semana más caro: es la respuesta que se busca en esta vista.
  const peak = byWeekday
    ? weekdayData.reduce((max, p) => (p.gasto > max.gasto ? p : max), weekdayData[0])
    : null

  return (
    <Section
      id="evolucion"
      title="Evolución de gasto"
      subtitle={monthLabel}
      actions={
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="font-mono text-[10px] text-dust block">media diaria</span>
            <span className="font-mono text-sm text-fog">{fmt.format(avgDaily)}</span>
          </div>
          {/*
            Al pasar por una barra, el acumulado del mes cede el sitio a la
            barra señalada: el dato aparece donde ya estabas mirando, sin
            perseguir el tooltip por el gráfico.
          */}
          <div className="text-right min-w-[6.5rem]">
            <span className="font-mono text-[10px] text-dust block truncate">
              {hovered
                ? byWeekday
                  ? `media ${hovered.day}`
                  : `día ${hovered.day}`
                : byWeekday
                  ? `más caro · ${peak?.day}`
                  : 'acumulado'}
            </span>
            <span className={`font-mono text-sm ${hovered ? 'text-brass' : 'text-stone'}`}>
              {fmt.format(hovered ? hovered.gasto : byWeekday ? (peak?.gasto ?? 0) : totalSpent)}
            </span>
          </div>

          {/* Mismo mes, dos preguntas: cuándo gasté, y en qué días suelo gastar. */}
          <div className="flex items-center border border-wall rounded-sm overflow-hidden">
            {VIEWS.map((option) => {
              const active = view === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setView(option.value)
                    setHovered(null)
                  }}
                  title={option.hint}
                  aria-pressed={active}
                  className={`px-3 py-1 font-mono text-[10px] tracking-widest uppercase transition-colors ${
                    active
                      ? 'bg-brass text-void font-medium'
                      : 'text-dust hover:text-fog hover:bg-pit'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      }
    >
      {/* chart */}
      <div className="px-4 pt-6 pb-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={chartData}
            barCategoryGap={byWeekday ? '30%' : '15%'}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onMouseMove={(state: any) => setHovered(pointAt(state))}
            onMouseLeave={() => setHovered(null)}
            /*
              En un móvil no hay por dónde pasar el ratón, y el gasto de cada
              día no está escrito en ningún otro sitio: sin esto, tocar una
              barra no dice nada. El toque hace lo mismo que el hover, y
              tocar fuera de las barras lo devuelve al acumulado del mes.
            */
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(state: any) => setHovered(pointAt(state))}
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
              interval={byWeekday ? 0 : 4}
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
            >
              {/* En la vista semanal el día más caro va sin velo: se ve de un vistazo. */}
              {byWeekday &&
                chartData.map((point) => (
                  <Cell
                    key={point.day}
                    fillOpacity={point.day === peak?.day && point.gasto > 0 ? 1 : 0.45}
                  />
                ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  )
}
