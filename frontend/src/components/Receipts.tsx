import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { monthRange } from '../month'
import { prepareImage } from '../image'
import { subcategoryLabel, subcategoryColor, isFood } from '../subcategories'
import Section from './Section'
import ReceiptRow from './ReceiptRow'
import ScanningReceipt from './ScanningReceipt'

interface Props {
  month: Date
  /**
   * Si viene, solo los tickets pagados con esa cuenta. Los de efectivo no
   * tienen movimiento y por tanto no tienen cuenta: quedan fuera.
   */
  accountId?: string
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const fmtInt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export default function Receipts({ month, accountId }: Props) {
  const queryClient = useQueryClient()
  /** Escaneo en curso: `preview` es la foto que se está leyendo (null mientras se reduce). */
  const [progress, setProgress] = useState<{
    preview: string | null
    done: number
    total: number
  } | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [dragging, setDragging] = useState(false)
  /** Subcategoría señalada en el desglose de la cesta. */
  const [hoveredSub, setHoveredSub] = useState<string | null>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const { dateFrom, dateTo, label: monthLabel } = monthRange(month)

  const { data: receiptsData, isLoading } = useQuery({
    queryKey: ['receipts', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getReceipts(dateFrom, dateTo, accountId),
  })

  const { data: summary } = useQuery({
    queryKey: ['receipt-summary', dateFrom, dateTo, accountId ?? 'all'],
    queryFn: () => api.getReceiptSummary(dateFrom, dateTo, accountId),
  })

  const receipts = receiptsData?.receipts ?? []

  function flash(message: string) {
    setToast(message)
    setTimeout(() => setToast(''), 3500)
  }

  /** Escanea las fotos de una en una: el modelo lee un ticket por llamada. */
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) {
      setError('Selecciona una foto (JPEG, PNG o WebP)')
      return
    }

    setError('')
    let done = 0
    setProgress({ preview: null, done, total: images.length })

    for (const file of images) {
      try {
        const dataUrl = await prepareImage(file)
        // Ya hay foto reducida: se enseña bajo el barrido mientras el modelo lee.
        setProgress({ preview: dataUrl, done, total: images.length })
        const { receipt, candidates } = await api.scanReceipt(dataUrl)
        flash(
          candidates.length > 0 || receipt.transactionId === null
            ? `${receipt.merchant} — ${receipt.items.length} productos, sin vincular todavía`
            : `${receipt.merchant} — ${receipt.items.length} productos, vinculado al movimiento`
        )
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'No se pudo leer el ticket')
      } finally {
        done++
        setProgress({ preview: null, done, total: images.length })
      }
    }

    setProgress(null)
    void queryClient.invalidateQueries({ queryKey: ['receipts'] })
    void queryClient.invalidateQueries({ queryKey: ['receipt-summary'] })
  }

  const scanning = progress !== null
  const bars = summary?.bySubcategory.filter((row) => row.total > 0) ?? []
  const maxBar = bars.reduce((max, row) => Math.max(max, row.total), 0)

  return (
    <Section
      id="tickets"
      title="Tickets"
      subtitle={monthLabel}
      actions={
        <>
          {toast && <span className="font-mono text-[11px] text-moss">{toast}</span>}
          {receipts.length > 0 && (
            <span className="font-mono text-[11px] text-dust">
              {receipts.length} {receipts.length === 1 ? 'ticket' : 'tickets'}
            </span>
          )}
        </>
      }
    >
      {/* ── Captura ─────────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handleFiles(e.dataTransfer.files)
        }}
        className={`px-6 py-6 border-b border-wall transition-colors ${
          dragging ? 'bg-pit' : ''
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => cameraInput.current?.click()}
            disabled={scanning}
            className="font-mono text-[11px] tracking-[0.12em] uppercase text-stone border border-brass/60 hover:border-brass px-4 py-2 transition-colors disabled:opacity-40"
          >
            Hacer foto
          </button>

          <button
            onClick={() => fileInput.current?.click()}
            disabled={scanning}
            className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog hover:text-stone border border-wall hover:border-fog px-4 py-2 transition-colors disabled:opacity-40"
          >
            Subir foto
          </button>

          {!scanning && (
            <span className="font-mono text-[11px] text-dust">
              o arrastra aquí las fotos de los tickets
            </span>
          )}
        </div>

        {/* `key` por foto: reinicia el cronómetro y las fases en cada ticket. */}
        {progress && (
          <ScanningReceipt
            key={progress.done}
            preview={progress.preview}
            done={progress.done}
            total={progress.total}
          />
        )}

        {/* `capture` abre la cámara trasera en el móvil; en escritorio se ignora. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {error && <p className="font-mono text-[11px] text-rust mt-3">{error}</p>}
      </div>

      {/* ── Desglose de la cesta ────────────────────────── */}
      {summary && summary.itemCount > 0 && (
        <div className="px-6 py-6 border-b border-wall">
          {/* cifras de cabecera */}
          <div className="flex flex-wrap gap-x-10 gap-y-4 mb-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1">
                Comida
              </p>
              <p className="font-display text-2xl text-stone tabular-nums">
                {fmt.format(summary.foodTotal)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1">
                No es comida
              </p>
              <p className="font-display text-2xl text-fog tabular-nums">
                {fmt.format(summary.nonFoodTotal)}
              </p>
            </div>
            {summary.unlinkedTotal > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-1">
                  En efectivo
                </p>
                <p
                  className="font-display text-2xl text-brass tabular-nums"
                  title="Tickets sin movimiento bancario: gasto que el banco no trae"
                >
                  {fmt.format(summary.unlinkedTotal)}
                </p>
              </div>
            )}
          </div>

          {summary.nonFoodTotal > 0 && (
            <p className="font-mono text-[11px] text-dust mb-5">
              De los {fmt.format(summary.total)} de la cesta,{' '}
              <span className="text-fog">{fmt.format(summary.nonFoodTotal)}</span> no eran comida
              (droguería, higiene y bazar).
            </p>
          )}

          {/* barras por subcategoría */}
          <ul className="space-y-2">
            {bars.map((row) => {
              const color = subcategoryColor(row.subcategory)
              const share = summary.total > 0 ? row.total / summary.total : 0
              const isHovered = hoveredSub === row.subcategory
              return (
                <li
                  key={row.subcategory}
                  onMouseEnter={() => setHoveredSub(row.subcategory)}
                  onMouseLeave={() => setHoveredSub(null)}
                  // Mismo gesto que en el donut de categorías: lo señalado se
                  // destaca y el resto se apaga, para poder comparar una
                  // subcategoría contra el conjunto sin perderla de vista.
                  className={`flex items-center gap-3 -mx-2 px-2 py-0.5 rounded-sm transition-all duration-200 ${
                    isHovered ? 'bg-pit' : hoveredSub !== null ? 'opacity-40' : ''
                  }`}
                >
                  <span
                    className={`font-mono text-[11px] w-36 shrink-0 truncate ${
                      isFood(row.subcategory) ? 'text-stone' : 'text-fog'
                    }`}
                  >
                    {subcategoryLabel(row.subcategory)}
                  </span>

                  <span className="flex-1 h-2.5 bg-void min-w-0" aria-hidden="true">
                    <span
                      className="block h-full transition-all duration-200"
                      style={{
                        width: `${maxBar > 0 ? (row.total / maxBar) * 100 : 0}%`,
                        backgroundColor: color,
                        boxShadow: isHovered ? `0 0 0 1px ${color}` : undefined,
                      }}
                    />
                  </span>

                  <span className="font-mono text-[11px] text-dust tabular-nums w-10 text-right shrink-0">
                    {Math.round(share * 100)}%
                  </span>

                  <span className="font-mono text-[12px] text-fog tabular-nums w-20 text-right shrink-0">
                    {row.total >= 100 ? fmtInt.format(row.total) : fmt.format(row.total)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── Lista de tickets ────────────────────────────── */}
      {isLoading && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust animate-pulse">Cargando…</p>
        </div>
      )}

      {!isLoading && receipts.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="font-mono text-sm text-dust">Sin tickets en {monthLabel}</p>
          <p className="font-mono text-[11px] text-dust mt-2">
            Fotografía un ticket para ver en qué se te va exactamente la compra
          </p>
        </div>
      )}

      {receipts.map((receipt) => (
        <ReceiptRow key={receipt.id} receipt={receipt} onMessage={flash} />
      ))}
    </Section>
  )
}
