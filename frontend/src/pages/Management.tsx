import { type Account } from '../api'
import Categorizer from '../components/Categorizer'
import FixedExpenses from '../components/FixedExpenses'

interface Props {
  accounts: Account[]
  month: Date
  accountId?: string
}

/**
 * Lo que es mantenimiento y no lectura: clasificar lo que quedó en «otros» y
 * llevar la lista de gastos fijos. Vive fuera del panel porque ocupa mucho
 * sitio para lo poco que se mira, y el panel es para los datos.
 *
 * El mes y la cuenta son los que estén elegidos en el panel: la cabecera es
 * la misma y el estado no se pierde al ir y volver.
 */
export default function Management({ accounts, month, accountId }: Props) {
  return (
    <div className="space-y-5">
      <Categorizer accounts={accounts} accountId={accountId} />
      <FixedExpenses accounts={accounts} month={month} accountId={accountId} />
    </div>
  )
}
