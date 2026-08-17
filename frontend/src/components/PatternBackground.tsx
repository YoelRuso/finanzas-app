import { useEffect, useRef } from 'react'

/** Separación de la rejilla, en px CSS. */
const SPACING = 30
/** Radio de influencia del cursor, en px CSS. */
const HALO = 165
/** Milisegundos entre fotogramas (~40 fps): el efecto es lento, no hace falta más. */
const FRAME_MS = 25

// dust (#5E5E6E) en reposo → brass (#D4B87A) bajo el cursor.
const BASE_RGB = [94, 94, 110] as const
const HALO_RGB = [212, 184, 122] as const

/**
 * Rejilla de puntos a pantalla completa. Respira muy lentamente y los puntos
 * cercanos al ratón crecen y viran a brass. Se dibuja en canvas porque son
 * ~2000 puntos: con nodos DOM sería inviable.
 *
 * Va detrás de todo (fixed, z-0) y no intercepta clicks.
 */
export default function PatternBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Posición real del ratón y la que se dibuja (persigue a la real con un
    // retardo suave, para que el halo no vaya a saltos).
    let targetX = -9999
    let targetY = -9999
    let haloX = -9999
    let haloY = -9999
    let width = 0
    let height = 0
    let frame = 0
    let lastDraw = 0

    function resize() {
      if (!canvas || !ctx) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduceMotion) draw(0)
    }

    function draw(time: number) {
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)

      // Halo difuso muy tenue bajo el cursor: da cuerpo al efecto.
      if (!reduceMotion && haloX > -9999) {
        const glow = ctx.createRadialGradient(haloX, haloY, 0, haloX, haloY, HALO * 1.5)
        glow.addColorStop(0, 'rgba(212, 184, 122, 0.030)')
        glow.addColorStop(1, 'rgba(212, 184, 122, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, width, height)
      }

      // Centrado: sobra el mismo margen a izquierda y derecha.
      const cols = Math.floor(width / SPACING)
      const rows = Math.floor(height / SPACING)
      const offsetX = (width - cols * SPACING) / 2 + SPACING / 2
      const offsetY = (height - rows * SPACING) / 2 + SPACING / 2

      for (let row = 0; row <= rows; row++) {
        const y = offsetY + row * SPACING
        for (let col = 0; col <= cols; col++) {
          const x = offsetX + col * SPACING

          // Onda diagonal lentísima: el fondo nunca está del todo quieto.
          const breath = reduceMotion
            ? 0
            : Math.sin((x + y) * 0.010 + time * 0.00035)

          let t = 0
          if (!reduceMotion) {
            const dx = x - haloX
            const dy = y - haloY
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < HALO) {
              const linear = 1 - dist / HALO
              t = linear * linear // caída suave, sin borde duro
            }
          }

          const radius = 0.75 + breath * 0.10 + t * 1.5
          const alpha = 0.16 + breath * 0.035 + t * 0.5

          const r = Math.round(BASE_RGB[0] + (HALO_RGB[0] - BASE_RGB[0]) * t)
          const g = Math.round(BASE_RGB[1] + (HALO_RGB[1] - BASE_RGB[1]) * t)
          const b = Math.round(BASE_RGB[2] + (HALO_RGB[2] - BASE_RGB[2]) * t)

          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
          ctx.fill()
        }
      }
    }

    function loop(time: number) {
      frame = requestAnimationFrame(loop)
      if (time - lastDraw < FRAME_MS) return
      lastDraw = time

      if (haloX < -9000) {
        haloX = targetX
        haloY = targetY
      } else {
        haloX += (targetX - haloX) * 0.12
        haloY += (targetY - haloY) * 0.12
      }
      draw(time)
    }

    function onPointerMove(e: PointerEvent) {
      targetX = e.clientX
      targetY = e.clientY
    }

    function onPointerLeave() {
      // Fuera de la ventana: el halo se va, no se queda congelado en el borde.
      targetX = -9999
      targetY = -9999
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame)
      } else {
        lastDraw = 0
        frame = requestAnimationFrame(loop)
      }
    }

    resize()
    window.addEventListener('resize', resize)

    if (!reduceMotion) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerleave', onPointerLeave)
      document.addEventListener('visibilitychange', onVisibility)
      frame = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
    />
  )
}
