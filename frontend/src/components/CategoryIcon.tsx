import type { ReactNode } from 'react'

/**
 * Iconos de trazo, uno por categoría. Van en SVG inline en lugar de una
 * librería para no añadir dependencia ni peso: son doce trazados cortos.
 * Heredan el color del contenedor vía currentColor.
 */
const PATHS: Record<string, ReactNode> = {
  // carrito de la compra
  alimentacion: (
    <>
      <path d="M2.5 4h2.2l2.3 9.6a1.8 1.8 0 0 0 1.75 1.4h7.9a1.8 1.8 0 0 0 1.75-1.35L20 7.2H5.6" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  // coche
  transporte: (
    <>
      <path d="M3.5 13.5l1.8-5.2A2 2 0 0 1 7.2 7h9.6a2 2 0 0 1 1.9 1.3l1.8 5.2v4.2a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-1H6.9v1a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-4.2z" />
      <path d="M3.5 13.5h17" />
      <path d="M7 16.2h1.4M15.6 16.2H17" />
    </>
  ),
  // flechas de renovación
  suscripciones: (
    <>
      <path d="M17 2.5l3.5 3.5L17 9.5" />
      <path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5" />
      <path d="M7 21.5L3.5 18 7 14.5" />
      <path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5" />
    </>
  ),
  // cruz médica
  salud: <path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5V3z" />,
  // copa
  ocio: (
    <>
      <path d="M4.5 4h15l-7.5 8.5z" />
      <path d="M12 12.5V20" />
      <path d="M8 20h8" />
    </>
  ),
  // casa
  vivienda: (
    <>
      <path d="M2.8 10.6L12 3l9.2 7.6" />
      <path d="M5.4 9.4V19.5a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1V9.4" />
    </>
  ),
  // bolsa
  compras: (
    <>
      <path d="M5.8 7.2h12.4l1 13.3H4.8l1-13.3z" />
      <path d="M9 7.2V5.4a3 3 0 0 1 6 0v1.8" />
    </>
  ),
  // mancuerna
  deporte: (
    <>
      <path d="M6.6 6.8v10.4M17.4 6.8v10.4" />
      <path d="M3.4 9.6v4.8M20.6 9.6v4.8" />
      <path d="M6.6 12h10.8" />
    </>
  ),
  // birrete
  educacion: (
    <>
      <path d="M12 3.6L2.4 8.4 12 13.2l9.6-4.8L12 3.6z" />
      <path d="M6.2 10.7v4.6c0 1.6 2.6 2.9 5.8 2.9s5.8-1.3 5.8-2.9v-4.6" />
    </>
  ),
  // flecha entrante sobre una base
  ingresos: (
    <>
      <path d="M12 3.2v11.4" />
      <path d="M7.4 10l4.6 4.6L16.6 10" />
      <path d="M4 20.4h16" />
    </>
  ),
  // flechas opuestas
  transferencias: (
    <>
      <path d="M3.2 8.2h13.6M12.8 4l4 4.2-4 4.2" />
      <path d="M20.8 15.8H7.2M11.2 11.6l-4 4.2 4 4.2" />
    </>
  ),
  // sin categoría
  otros: (
    <>
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18.5" cy="12" r="1.2" />
    </>
  ),
}

interface Props {
  category: string | null | undefined
  className?: string
}

export default function CategoryIcon({ category, className = 'w-4 h-4' }: Props) {
  const paths = PATHS[category ?? 'otros'] ?? PATHS.otros

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}
