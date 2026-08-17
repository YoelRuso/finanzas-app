import { useEffect, useState } from 'react'

interface Props {
  /** Foto ya reducida que se está leyendo; null mientras se prepara. */
  preview: string | null
  /** Fotos ya terminadas y total, para el contador cuando se suben varias. */
  done: number
  total: number
}

/**
 * Fases del escaneo. El backend no informa del progreso —es una única llamada
 * al modelo, sin streaming—, así que el mensaje avanza por tiempo: no mide
 * nada real, pero dice qué está pasando y deja claro que no se ha colgado.
 * Los tiempos salen de lo que tarda un ticket normal de súper (~10-20 s).
 */
const STAGES: { after: number; text: string }[] = [
  { after: 0, text: 'Preparando la foto' },
  { after: 2, text: 'Enviando la imagen' },
  { after: 5, text: 'Leyendo el ticket' },
  { after: 10, text: 'Reconociendo los productos' },
  { after: 18, text: 'Clasificando la cesta' },
  { after: 28, text: 'Casi está' },
]

/** Anchos de las líneas fantasma: irregulares, como una lista de productos. */
const GHOST_WIDTHS = ['78%', '92%', '64%', '85%']

/**
 * Indicador de que se está leyendo un ticket: miniatura de la propia foto con
 * un barrido de escáner encima, la fase actual y el tiempo transcurrido.
 * Se monta con `key={done}` para que el cronómetro arranque de cero en cada foto.
 */
export default function ScanningReceipt({ preview, done, total }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    return () => clearInterval(id)
  }, [])

  // La fase de preparación dura lo que tarde el navegador en reducir la foto,
  // no lo que diga el reloj: mientras no haya miniatura, seguimos en la primera.
  const stage = preview
    ? STAGES.reduce((current, next) => (elapsed >= next.after ? next : current)).text
    : STAGES[0].text

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 flex items-start gap-4 border border-brass/30 bg-pit/50 px-4 py-4"
    >
      {/* ── Miniatura con el barrido ─────────────────────── */}
      <div className="relative w-16 h-24 shrink-0 overflow-hidden border border-wall bg-void">
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover opacity-60" />
        ) : (
          // Aún no hay foto reducida: se insinúa un ticket con líneas.
          <div className="p-2 pt-3 space-y-[5px]">
            {GHOST_WIDTHS.map((width, i) => (
              <span
                key={i}
                className="block h-[3px] bg-wall scan-ghost"
                style={{ width, animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        )}

        {/* Línea del escáner: recorre la foto de arriba abajo sin parar. */}
        <span
          aria-hidden="true"
          className="scan-sweep absolute inset-x-0 top-0 h-px bg-brass shadow-[0_0_10px_2px_rgba(212,184,122,0.55)]"
        />
      </div>

      {/* ── Estado ──────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-brass">
          {stage}
          <span aria-hidden="true">
            <span className="scan-dot">.</span>
            <span className="scan-dot">.</span>
            <span className="scan-dot">.</span>
          </span>
        </p>

        <p className="font-mono text-[10px] text-dust mt-1.5 tabular-nums">
          {total > 1 && <>Foto {Math.min(done + 1, total)} de {total} · </>}
          {elapsed}s
          {elapsed >= 20 && <> · los tickets largos tardan un poco más</>}
        </p>

        {/* Barra indeterminada: no sabemos cuánto queda, solo que sigue vivo. */}
        <div className="relative h-px bg-wall mt-3 overflow-hidden">
          <span aria-hidden="true" className="scan-track absolute inset-y-0 w-1/3 bg-brass" />
        </div>

        {/* Líneas fantasma: la lista de la compra que se está montando. */}
        <ul className="mt-3 space-y-[6px]">
          {GHOST_WIDTHS.slice(0, 3).map((width, i) => (
            <li
              key={i}
              className="h-[6px] bg-wall/70 scan-ghost"
              style={{ width, animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
