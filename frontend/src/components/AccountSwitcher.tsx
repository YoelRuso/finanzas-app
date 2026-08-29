import { useEffect, useRef, useState } from 'react'
import { type Account } from '../api'
import { accountLabel } from '../account'

interface Props {
  accounts: Account[]
  /** Cuenta activa, o null para verlas todas juntas. */
  value: string | null
  onChange: (accountId: string | null) => void
}

function chipClass(active: boolean): string {
  return `shrink-0 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
    active
      ? 'text-brass border-brass/60 bg-brass/10'
      : 'text-dust border-transparent hover:text-fog hover:bg-pit'
  }`
}

/**
 * Selector de cuenta del header. Gobierna todo el dashboard: con una cuenta
 * elegida, saldo, gráficas, tickets, consejos y movimientos se refieren solo
 * a ella. Vive arriba y pegado porque cambiar de cuenta tiene que poder
 * hacerse desde cualquier punto de la página, no solo desde el apartado
 * "Cuentas".
 *
 * Dos formas según el ancho, porque la tira de píldoras no cabe en el móvil:
 * ahí la cabecera solo le deja ~50 px de los 250 que pide, y las cuentas
 * quedaban escondidas tras un scroll horizontal sin barra, es decir,
 * invisibles. En móvil se enseña solo la cuenta activa y las demás salen en
 * un desplegable.
 */
export default function AccountSwitcher({ accounts, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cierra el desplegable al tocar fuera o pulsar Escape. Mismo trato que el
  // selector de categoría de los movimientos.
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Con una sola cuenta no hay nada entre lo que elegir.
  if (accounts.length < 2) return null

  const active = value ? accounts.find((a) => a.id === value) : undefined
  const options: { id: string | null; label: string }[] = [
    { id: null, label: 'Todas' },
    ...accounts.map((a) => ({ id: a.id, label: accountLabel(a) })),
  ]

  return (
    <>
      {/* Móvil: una sola píldora con la cuenta activa, y el resto al abrirla. */}
      <div ref={menuRef} className="relative sm:hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Cuenta que se está viendo"
          className={`flex items-center gap-1.5 max-w-full px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
            value ? 'text-brass border-brass/60 bg-brass/10' : 'text-fog border-wall'
          }`}
        >
          <span className="truncate">{active ? accountLabel(active) : 'Todas'}</span>
          <span aria-hidden="true" className="shrink-0 text-[8px] opacity-70">
            ▾
          </span>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1 z-40 w-48 bg-shell border border-wall shadow-xl py-1"
          >
            {options.map((option) => (
              <button
                key={option.id ?? 'todas'}
                role="menuitem"
                onClick={() => {
                  onChange(option.id)
                  setOpen(false)
                }}
                className={`w-full px-3 py-1.5 font-mono text-[11px] text-left truncate transition-colors ${
                  option.id === value
                    ? 'bg-pit text-brass'
                    : 'text-fog hover:bg-pit hover:text-stone'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* A partir de sm sí caben todas a la vista, que es un clic menos. */}
      <div
        role="group"
        aria-label="Cuenta que se está viendo"
        className="hidden sm:flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar"
      >
        <button
          onClick={() => onChange(null)}
          aria-current={value === null ? 'true' : undefined}
          title="Ver todas las cuentas juntas"
          className={chipClass(value === null)}
        >
          Todas
        </button>
        {accounts.map((account) => (
          <button
            key={account.id}
            onClick={() => onChange(account.id)}
            aria-current={value === account.id ? 'true' : undefined}
            title={`Ver solo ${accountLabel(account)}`}
            className={`${chipClass(value === account.id)} max-w-[7rem] sm:max-w-[11rem] truncate`}
          >
            {accountLabel(account)}
          </button>
        ))}
      </div>
    </>
  )
}
