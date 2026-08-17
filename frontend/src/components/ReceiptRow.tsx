import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Receipt } from '../api'
import { SUBCATEGORIES, subcategoryLabel, subcategoryColor } from '../subcategories'
import Badge from './Badge'

interface Props {
  receipt: Receipt
  onMessage: (text: string) => void
}

const fmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const fmtDate = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' })

/** Las cantidades a peso llevan decimales; las unidades, no. */
function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? `${quantity}×` : `${quantity.toFixed(3)} kg`
}

export default function ReceiptRow({ receipt, onMessage }: Props) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showImage, setShowImage] = useState(false)

  const linked = receipt.transaction !== null

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['receipts'] })
    void queryClient.invalidateQueries({ queryKey: ['receipt-summary'] })
  }

  // Solo se buscan movimientos candidatos cuando hace falta enseñarlos.
  const { data: candidatesData, isLoading: loadingCandidates } = useQuery({
    queryKey: ['receipt-candidates', receipt.id],
    queryFn: () => api.getReceiptCandidates(receipt.id),
    enabled: open && !linked,
  })

  const candidates = candidatesData?.candidates ?? []

  const link = useMutation({
    mutationFn: (transactionId: number | null) => api.linkReceipt(receipt.id, transactionId),
    onSuccess: (_res, transactionId) => {
      onMessage(transactionId === null ? 'Ticket desvinculado' : 'Ticket vinculado al movimiento')
      refresh()
    },
    onError: (err: Error) => onMessage(err.message),
  })

  const reclassify = useMutation({
    mutationFn: ({ id, subcategory, name }: { id: number; subcategory: string; name: string }) =>
      // La keyword es el nombre completo del producto: preciso, sin
      // arrastrar por error otros artículos que compartan una palabra.
      api.updateReceiptItem(id, { subcategory, applyToSimilar: true, keyword: name }),
    onSuccess: (res, { subcategory }) => {
      onMessage(
        res.applied > 1
          ? `${res.applied} líneas → ${subcategoryLabel(subcategory)}`
          : `Guardado en ${subcategoryLabel(subcategory)}`
      )
      refresh()
    },
    onError: (err: Error) => onMessage(err.message),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteReceipt(receipt.id),
    onSuccess: () => {
      onMessage('Ticket eliminado')
      refresh()
    },
    onError: (err: Error) => onMessage(err.message),
  })

  // Lo que suman las líneas puede no cuadrar con el total del ticket si
  // alguna línea salió ilegible. Merece la pena avisarlo.
  const itemsTotal = receipt.items.reduce((sum, item) => sum + item.total, 0)
  const gap = Math.abs(itemsTotal - receipt.total)

  return (
    <div className="border-b border-wall last:border-b-0">
      {/* cabecera del ticket */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-6 py-3.5 text-left transition-colors ${
          open ? 'bg-pit' : 'hover:bg-shell'
        }`}
      >
        <span className="font-mono text-[11px] text-dust shrink-0 w-14">
          {fmtDate.format(new Date(receipt.date)).toUpperCase()}
        </span>

        <span className="font-sans text-sm text-stone flex-1 truncate">{receipt.merchant}</span>

        <span className="hidden sm:block font-mono text-[11px] text-dust shrink-0">
          {receipt.items.length} líneas
        </span>

        {/* estado del vínculo con el banco */}
        <span className="hidden md:flex shrink-0 w-36 justify-end">
          <Badge
            tone={linked ? 'good' : 'warn'}
            title={
              linked
                ? 'Desglosa un movimiento del banco: no suma gasto nuevo'
                : 'Sin movimiento asociado: cuenta como gasto en efectivo'
            }
          >
            {linked ? 'Vinculado' : 'Sin movimiento'}
          </Badge>
        </span>

        <span className="font-mono text-sm text-fog tabular-nums shrink-0 w-24 text-right">
          {fmt.format(receipt.total)}
        </span>

        <span
          className={`font-mono text-[11px] text-dust shrink-0 w-4 text-right transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          ›
        </span>
      </button>

      {open && (
        <div className="bg-pit px-6 pb-5 pt-1 space-y-4">
          {receipt.warning && (
            <p className="font-mono text-[11px] text-brass">⚠ {receipt.warning}</p>
          )}

          {gap > 0.05 && (
            <p className="font-mono text-[11px] text-brass">
              Las líneas suman {fmt.format(itemsTotal)} y el ticket marca{' '}
              {fmt.format(receipt.total)} — revisa si falta algún producto.
            </p>
          )}

          {/* ── Vínculo con el movimiento bancario ────────── */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-2">
              Movimiento del banco
            </p>

            {linked && receipt.transaction && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[11px] text-fog">
                  {fmtDate.format(new Date(receipt.transaction.date)).toUpperCase()} ·{' '}
                  {receipt.transaction.description} ·{' '}
                  {fmt.format(Math.abs(receipt.transaction.amount))}
                </span>
                <button
                  onClick={() => link.mutate(null)}
                  disabled={link.isPending}
                  className="font-mono text-[11px] text-dust hover:text-rust transition-colors underline underline-offset-2 disabled:opacity-50"
                >
                  Desvincular
                </button>
              </div>
            )}

            {!linked && loadingCandidates && (
              <p className="font-mono text-[11px] text-dust animate-pulse">Buscando…</p>
            )}

            {!linked && !loadingCandidates && candidates.length === 0 && (
              <p className="font-mono text-[11px] text-dust">
                Ningún movimiento cuadra con {fmt.format(receipt.total)} en esas fechas — se
                cuenta como gasto en efectivo.
              </p>
            )}

            {!linked && candidates.length > 0 && (
              <div className="space-y-1.5">
                {candidates.map((candidate) => (
                  <div key={candidate.id} className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-fog flex-1 truncate">
                      {fmtDate.format(new Date(candidate.date)).toUpperCase()} ·{' '}
                      {candidate.description} · {fmt.format(Math.abs(candidate.amount))}
                    </span>
                    <button
                      onClick={() => link.mutate(candidate.id)}
                      disabled={link.isPending}
                      className="font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone border border-wall hover:border-fog px-2.5 py-1 transition-colors disabled:opacity-50 shrink-0"
                    >
                      Vincular
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Líneas del ticket ─────────────────────────── */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dust mb-2">
              Productos — cambia la categoría y se recordará para próximos tickets
            </p>

            <div className="divide-y divide-wall/60">
              {receipt.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2">
                  <span className="font-mono text-[11px] text-dust shrink-0 w-16 tabular-nums">
                    {formatQuantity(item.quantity)}
                  </span>

                  <span className="font-sans text-[13px] text-stone flex-1 truncate">
                    {item.name}
                  </span>

                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: subcategoryColor(item.subcategory) }}
                    aria-hidden="true"
                  />

                  <select
                    value={item.subcategory}
                    onChange={(e) =>
                      reclassify.mutate({
                        id: item.id,
                        subcategory: e.target.value,
                        name: item.name,
                      })
                    }
                    disabled={reclassify.isPending}
                    aria-label={`Categoría de ${item.name}`}
                    className="bg-void border border-wall focus:border-fog px-2 py-1 font-mono text-[11px] text-fog outline-none transition-colors shrink-0 max-w-[9.5rem] disabled:opacity-50"
                  >
                    {SUBCATEGORIES.map((sub) => (
                      <option key={sub} value={sub}>
                        {subcategoryLabel(sub)}
                      </option>
                    ))}
                  </select>

                  <span
                    className={`font-mono text-[12px] tabular-nums shrink-0 w-20 text-right ${
                      item.total < 0 ? 'text-moss' : 'text-fog'
                    }`}
                  >
                    {fmt.format(item.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Foto y borrado ────────────────────────────── */}
          <div className="flex items-center gap-4">
            {receipt.imagePath && (
              <button
                onClick={() => setShowImage((v) => !v)}
                className="font-mono text-[11px] tracking-widest uppercase text-fog hover:text-stone transition-colors border-b border-transparent hover:border-fog pb-px"
              >
                {showImage ? 'Ocultar foto' : 'Ver foto'}
              </button>
            )}
            <button
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="font-mono text-[11px] tracking-widest uppercase text-dust hover:text-rust transition-colors disabled:opacity-50"
            >
              {remove.isPending ? 'Eliminando…' : 'Eliminar ticket'}
            </button>
          </div>

          {showImage && receipt.imagePath && (
            <img
              src={api.receiptImageUrl(receipt.id)}
              alt={`Ticket de ${receipt.merchant}`}
              className="max-h-[70vh] border border-wall"
            />
          )}
        </div>
      )}
    </div>
  )
}
