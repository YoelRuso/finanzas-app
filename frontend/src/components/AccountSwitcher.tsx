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
 */
export default function AccountSwitcher({ accounts, value, onChange }: Props) {
  // Con una sola cuenta no hay nada entre lo que elegir.
  if (accounts.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Cuenta que se está viendo"
      className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar"
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
  )
}
