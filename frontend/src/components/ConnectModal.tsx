import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, type ASPSP } from '../api'

interface Props {
  onClose: () => void
}

export default function ConnectModal({ onClose }: Props) {
  const [selected, setSelected] = useState<ASPSP | null>(null)
  const [filter, setFilter] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['aspsps'],
    queryFn: api.getASPSPs,
  })

  const connect = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('No bank selected')
      return api.startAuth(selected.name, selected.country)
    },
    onSuccess: ({ url }) => {
      window.location.href = url
    },
  })

  const filtered = (data?.aspsps ?? []).filter(
    (a) =>
      filter === '' ||
      a.name.toLowerCase().includes(filter.toLowerCase()) ||
      a.country.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* overlay */}
      <div className="absolute inset-0 bg-void/90 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      {/* En móvil sube desde abajo, así que solo redondea por arriba. */}
      <div className="relative z-10 w-full sm:max-w-lg bg-shell border border-wall rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-wall">
          <span className="text-[10px] font-sans tracking-[0.2em] uppercase text-fog">
            Conectar banco
          </span>
          <button
            onClick={onClose}
            className="text-fog hover:text-stone text-lg leading-none transition-colors"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* search */}
        <div className="px-6 py-3 border-b border-wall">
          <input
            type="text"
            placeholder="Buscar banco o país..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-transparent font-mono text-sm text-stone placeholder:text-dust outline-none"
            autoFocus
          />
        </div>

        {/* list */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="px-6 py-10 text-center font-mono text-xs text-fog">
              Cargando bancos disponibles…
            </div>
          )}
          {isError && (
            <div className="px-6 py-10 text-center font-mono text-xs text-rust">
              Error al cargar bancos. ¿Está el backend corriendo?
            </div>
          )}
          {filtered.map((aspsp) => (
            <button
              key={`${aspsp.name}-${aspsp.country}`}
              onClick={() => setSelected(aspsp)}
              className={`
                w-full flex items-center justify-between px-6 py-3 border-b border-wall
                text-left transition-colors
                ${selected?.name === aspsp.name && selected?.country === aspsp.country
                  ? 'bg-pit text-stone'
                  : 'hover:bg-pit text-fog hover:text-stone'
                }
              `}
            >
              <span className="font-sans text-sm">{aspsp.name}</span>
              <span className="font-mono text-[10px] tracking-widest text-dust uppercase">
                {aspsp.country}
              </span>
            </button>
          ))}
          {!isLoading && !isError && filtered.length === 0 && (
            <div className="px-6 py-10 text-center font-mono text-xs text-fog">
              Sin resultados
            </div>
          )}
        </div>

        {/* action */}
        <div className="px-6 py-4 border-t border-wall flex items-center justify-between">
          <span className="font-mono text-[10px] text-dust">
            {selected ? selected.name : 'Selecciona un banco'}
          </span>
          <button
            onClick={() => connect.mutate()}
            disabled={!selected || connect.isPending}
            className={`
              px-5 py-2 border text-[11px] tracking-[0.15em] uppercase font-sans transition-colors
              ${selected && !connect.isPending
                ? 'border-stone text-stone hover:bg-stone hover:text-void'
                : 'border-wall text-dust cursor-not-allowed'
              }
            `}
          >
            {connect.isPending ? 'Redirigiendo…' : 'Conectar'}
          </button>
        </div>
      </div>
    </div>
  )
}
