import { forwardRef, type ReactNode } from 'react'

interface Props {
  /** Ancla para el índice lateral. */
  id?: string
  /** Título del apartado. Se muestra en mayúsculas junto al acento brass. */
  title: string
  /** Texto secundario a la derecha del título (mes, recuento…). */
  subtitle?: ReactNode
  /** Botones y datos alineados a la derecha de la cabecera. */
  actions?: ReactNode
  /**
   * Deja que el contenido se salga del panel. Solo para apartados con menús
   * flotantes dentro: el recorte que redondea las esquinas los cortaría.
   */
  allowOverflow?: boolean
  children: ReactNode
}

/**
 * Envoltorio común de cada apartado del dashboard: panel con borde propio y
 * cabecera con barra de acento. Centraliza el aspecto para que todas las
 * secciones se lean como bloques separados.
 */
const Section = forwardRef<HTMLElement, Props>(function Section(
  { id, title, subtitle, actions, allowOverflow, children },
  ref
) {
  return (
    // scroll-mt deja hueco para el header fijo al saltar desde el índice.
    <section
      ref={ref}
      id={id}
      className={`panel scroll-mt-20 ${allowOverflow ? 'panel-overflow' : ''}`}
    >
      {/*
        La cabecera envuelve en vez de estrangularse: en el móvil el título y
        sus controles piden más de los 350 px de ancho, y al no caber el
        título se salía por encima de los botones. Al envolver, los controles
        bajan enteros a su propia línea.
      */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-6 py-3.5 border-b border-wall">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-[2px] h-3.5 bg-brass shrink-0" aria-hidden="true" />
          <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-stone whitespace-nowrap">
            {title}
          </h2>
          {subtitle && (
            <span className="font-mono text-[11px] text-dust truncate">— {subtitle}</span>
          )}
        </div>
        {actions && (
          <div className="flex grow flex-wrap items-center justify-end gap-x-4 gap-y-2 min-w-0">
            {actions}
          </div>
        )}
      </header>
      {children}
    </section>
  )
})

export default Section
