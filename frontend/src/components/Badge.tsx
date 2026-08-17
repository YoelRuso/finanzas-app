import type { ReactNode } from 'react'

/**
 * Etiqueta de estado. Un estado se lee de un vistazo por el color y la forma,
 * no leyendo la frase: por eso todos los estados de la app (un ticket
 * vinculado, un gasto que se pasa de los ingresos, un consentimiento
 * caducado) usan esta misma pieza en vez de texto suelto de colores.
 *
 * El punto de la izquierda es lo que la hace legible sin depender del color:
 * relleno = estado firme, hueco = pendiente o informativo.
 */
export type BadgeTone = 'good' | 'warn' | 'alert' | 'neutral'

const TONES: Record<BadgeTone, { text: string; border: string; bg: string; solid: boolean }> = {
  // Resuelto y correcto: ticket vinculado, todo clasificado.
  good: { text: 'text-moss', border: 'border-moss/40', bg: 'bg-moss/10', solid: true },
  // Requiere una decisión tuya, pero nada va mal: ticket sin movimiento.
  warn: { text: 'text-brass', border: 'border-brass/40', bg: 'bg-brass/10', solid: false },
  // Algo que conviene mirar ya: gasto por encima de ingresos, consentimiento caducado.
  alert: { text: 'text-rust', border: 'border-rust/45', bg: 'bg-rust/10', solid: true },
  // Dato de contexto sin carga: traspaso, recuentos.
  neutral: { text: 'text-fog', border: 'border-wall', bg: 'bg-pit/60', solid: false },
}

interface Props {
  tone?: BadgeTone
  children: ReactNode
  /** Oculta el punto cuando la etiqueta ya lleva su propio icono. */
  dot?: boolean
  title?: string
  className?: string
}

export default function Badge({
  tone = 'neutral',
  children,
  dot = true,
  title,
  className = '',
}: Props) {
  const t = TONES[tone]

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-[0.12em] whitespace-nowrap ${t.text} ${t.border} ${t.bg} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full border border-current shrink-0 ${
            t.solid ? 'bg-current' : ''
          }`}
        />
      )}
      {children}
    </span>
  )
}
