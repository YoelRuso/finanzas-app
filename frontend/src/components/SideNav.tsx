import { useEffect, useRef, useState } from 'react'

export interface NavItem {
  id: string
  label: string
}

interface Props {
  items: NavItem[]
  /** Id del contenedor cuyos hijos directos son los apartados. */
  containerId: string
}

/**
 * Índice pegajoso de apartados. Marca el que se está viendo y permite saltar
 * a cualquiera. Se apoya en los ids que pone el propio Dashboard.
 */
export default function SideNav({ items, containerId }: Props) {
  const [present, setPresent] = useState<string[]>(() => items.map((i) => i.id))
  const [active, setActive] = useState<string | null>(null)
  const visible = useRef(new Set<string>())

  useEffect(() => {
    const container = document.getElementById(containerId)
    if (!container) return

    let observer: IntersectionObserver | null = null

    function sync() {
      observer?.disconnect()
      visible.current.clear()

      // Algunos apartados no se pintan si no hay datos (p. ej. la evolución
      // diaria); el índice solo debe listar los que existen ahora mismo.
      const found = items.filter((item) => document.getElementById(item.id))
      setPresent(found.map((item) => item.id))

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.current.add(entry.target.id)
            else visible.current.delete(entry.target.id)
          }
          // De los visibles, el activo es el que va primero en la página.
          const first = items.find((item) => visible.current.has(item.id))
          setActive(first?.id ?? null)
        },
        // La franja de decisión es el tercio superior, bajo el header fijo.
        { rootMargin: '-76px 0px -62% 0px' }
      )

      for (const item of found) {
        const el = document.getElementById(item.id)
        if (el) observer.observe(el)
      }
    }

    sync()

    // childList sin subtree: solo salta cuando un apartado entra o sale.
    const mutations = new MutationObserver(sync)
    mutations.observe(container, { childList: true })

    return () => {
      observer?.disconnect()
      mutations.disconnect()
    }
  }, [items, containerId])

  const shown = items.filter((item) => present.includes(item.id))
  if (shown.length === 0) return null

  return (
    <nav aria-label="Apartados">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust px-3 mb-3">
        Índice
      </p>
      <ul>
        {shown.map((item) => {
          const isActive = item.id === active
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={`block border-l-2 pl-3 pr-2 py-1.5 font-mono text-[11px] tracking-[0.1em] transition-colors ${
                  isActive
                    ? 'border-brass text-stone'
                    : 'border-wall text-dust hover:text-fog hover:border-fog'
                }`}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
