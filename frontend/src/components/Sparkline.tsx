interface Props {
  /** Valores en orden cronológico. El último es el mes más reciente. */
  values: number[]
  width?: number
  height?: number
  className?: string
}

/**
 * Mini gráfica de línea con relleno degradado. Va en SVG a mano y no en
 * Recharts: para seis puntos sin ejes ni tooltip, montar un ResponsiveContainer
 * cuesta más de lo que aporta.
 */
export default function Sparkline({ values, width = 148, height = 44, className }: Props) {
  if (values.length < 2) return null

  const max = Math.max(...values)
  const min = Math.min(...values)
  // Con todos los valores iguales el rango es 0: dibujamos una línea plana.
  const span = max - min || 1
  // Margen vertical para que el trazo no se corte contra el borde del viewBox.
  const pad = 4
  const usable = height - pad * 2

  const points = values.map((value, i) => {
    const x = (i / (values.length - 1)) * width
    const y = pad + (1 - (value - min) / span) * usable
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4B87A" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#D4B87A" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkline-fill)" />
      <path
        d={line}
        stroke="#D4B87A"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.85}
      />
      {/* Punto del mes más reciente. */}
      <circle cx={lastX} cy={lastY} r={2.5} fill="#D4B87A" />
    </svg>
  )
}
