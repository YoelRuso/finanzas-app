// Utilidades de mes compartidas por el dashboard.
// Todo se calcula en hora local: usar toISOString() directamente desplazaría
// el día en España (UTC+1/+2) y el rango se comería el día 1.

/** Fecha en formato YYYY-MM-DD según el calendario local. */
export function toLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Identificador YYYY-MM. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Primer día del mes al que pertenece la fecha. */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1)
}

/** Convierte "2026-07" en el Date del primer día de ese mes. */
export function monthKeyToDate(key: string): Date {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

export interface MonthRange {
  key: string
  dateFrom: string
  dateTo: string
  label: string
  daysInMonth: number
  /** Días transcurridos: el mes entero si ya terminó, los que van si es el actual. */
  elapsedDays: number
  isCurrent: boolean
  isFuture: boolean
}

export function monthRange(anchor: Date): MonthRange {
  const start = startOfMonth(anchor)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  const today = new Date()
  const currentStart = startOfMonth(today)

  const isCurrent = start.getTime() === currentStart.getTime()
  const isFuture = start.getTime() > currentStart.getTime()

  return {
    key: monthKey(start),
    dateFrom: toLocalDate(start),
    dateTo: toLocalDate(end),
    label: start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase(),
    daysInMonth: end.getDate(),
    elapsedDays: isCurrent ? today.getDate() : isFuture ? 0 : end.getDate(),
    isCurrent,
    isFuture,
  }
}
