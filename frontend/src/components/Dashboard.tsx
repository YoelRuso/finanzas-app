import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import HeroBalance from './HeroBalance'
import SpendingChart from './SpendingChart'
import MonthSelector from './MonthSelector'
import AdvicePanel from './AdvicePanel'
import { startOfMonth } from '../month'
import MonthlyTrend from './MonthlyTrend'
import TransactionList from './TransactionList'
import ConnectModal from './ConnectModal'
import SideNav, { type NavItem } from './SideNav'
import SpendingPace from './SpendingPace'
import RecentTransactions from './RecentTransactions'
import AccountBalances from './AccountBalances'
import AccountSwitcher from './AccountSwitcher'
import Receipts from './Receipts'
import MonthFlow from './MonthFlow'
import ChatDrawer from './ChatDrawer'
import Management from '../pages/Management'
import { accountLabel } from '../account'

/** Apartados del índice lateral, en el mismo orden en que se pintan. */
const NAV_ITEMS: NavItem[] = [
  { id: 'saldo', label: 'Saldo' },
  { id: 'flujo', label: 'Entra y sale' },
  { id: 'evolucion', label: 'Evolución' },
  { id: 'gasto', label: 'Gasto' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'consejos', label: 'Consejos' },
  { id: 'movimientos', label: 'Movimientos' },
]

/**
 * Las dos vistas de la app. La ruta manda sobre el estado, así que la página
 * de gestión se puede recargar y el botón de atrás del navegador funciona.
 */
type View = 'panel' | 'gestion'

const PATHS: Record<View, string> = { panel: '/', gestion: '/gestion' }

function viewFromPath(pathname: string): View {
  return pathname.startsWith('/gestion') ? 'gestion' : 'panel'
}

interface Props {
  /** Cuentas compartidas por el banco al volver del consentimiento. */
  justConnected: number | null
  onConnectedAck: () => void
}

export default function Dashboard({ justConnected, onConnectedAck }: Props) {
  const [showConnect, setShowConnect] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname))
  const [toast, setToast] = useState('')
  // Una autorización sin cuentas no es un éxito: se avisa en otro tono.
  const [toastError, setToastError] = useState(false)
  // Mes que se está viendo. Gobierna todas las secciones de abajo.
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  // Cuenta que se está viendo, null = todas. Igual que el mes, gobierna el
  // dashboard entero: se elige en el header y baja a cada sección.
  const [accountId, setAccountId] = useState<string | null>(null)

  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.getSessions,
    refetchInterval: 60_000,
  })

  const sessions = sessionsData?.sessions ?? []
  const accounts = sessions.flatMap((s) => s.accounts)

  // Misma clave que usa el clasificador: la consulta se comparte y solo
  // sirve para avisar en la cabecera de cuánto queda por clasificar.
  const { data: pendingData } = useQuery({
    queryKey: ['pending-groups', accountId ?? 'all'],
    queryFn: () => api.getPendingGroups('otros', accountId ?? undefined),
    enabled: accounts.length > 0,
  })

  const pending = pendingData?.totalTransactions ?? 0

  // Las cuentas que entran en lo que se pinta: una sola, o todas.
  const shown = accountId ? accounts.filter((a) => a.id === accountId) : accounts
  const accountFilter = accountId ?? undefined
  const activeAccount = accountId ? accounts.find((a) => a.id === accountId) : undefined

  // Si la cuenta elegida desaparece (banco desconectado, consentimiento
  // caducado), se vuelve a "todas" en vez de dejar el dashboard vacío.
  useEffect(() => {
    if (!sessionsData || !accountId) return
    if (!accounts.some((a) => a.id === accountId)) setAccountId(null)
  }, [sessionsData, accountId, accounts])

  // El botón de atrás del navegador tiene que devolver a la vista anterior.
  useEffect(() => {
    const onPop = () => setView(viewFromPath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function go(next: View) {
    if (next === view) return
    window.history.pushState({}, '', PATHS[next])
    setView(next)
    window.scrollTo({ top: 0 })
  }

  // Ctrl/Cmd + K abre y cierra el chat sin soltar el teclado.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        setShowChat((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (justConnected === null) return

    const failed = justConnected === 0
    setToastError(failed)
    setToast(
      failed
        ? 'El banco autorizó pero no compartió ninguna cuenta. Repite la conexión y marca la cuenta en la pantalla del banco.'
        : justConnected === 1
          ? 'Banco conectado — 1 cuenta'
          : `Banco conectado — ${justConnected} cuentas`
    )
    onConnectedAck()
    // El aviso de fallo tarda más en irse: hay que poder leerlo.
    const t = setTimeout(() => setToast(''), failed ? 10000 : 4000)
    return () => clearTimeout(t)
  }, [justConnected, onConnectedAck])

  const expiredSessions = sessions.filter(
    (s) => new Date(s.validUntil) < new Date()
  )

  return (
    <div className="relative z-10 min-h-screen font-sans">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center gap-4 sm:gap-6 px-4 sm:px-6 h-14 border-b border-wall bg-void/85 backdrop-blur-md">
        <span className="font-mono text-[12px] tracking-[0.3em] uppercase text-stone shrink-0">
          Finanzas
        </span>

        {/* Cuenta activa: al lado del título porque manda sobre toda la página. */}
        <div className="flex-1 min-w-0">
          <AccountSwitcher accounts={accounts} value={accountId} onChange={setAccountId} />
        </div>

        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          {/*
            Un único enlace que alterna, en vez de un menú: solo hay dos
            vistas y así la cabecera sigue cabiendo en el móvil.
          */}
          {view === 'panel' ? (
            <button
              onClick={() => go('gestion')}
              title="Clasificar movimientos y gastos fijos"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog hover:text-stone transition-colors border-b border-transparent hover:border-fog pb-px"
            >
              Gestión
              {pending > 0 && (
                <span className="ml-2 px-1.5 py-px bg-brass/15 text-brass tabular-nums text-[10px]">
                  {pending}
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={() => go('panel')}
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog hover:text-stone transition-colors border-b border-transparent hover:border-fog pb-px"
            >
              ‹ Panel
            </button>
          )}

          <button
            onClick={() => setShowConnect(true)}
            className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog hover:text-stone border border-wall hover:border-fog px-4 py-1.5 transition-colors"
          >
            {accounts.length === 0 ? 'Conectar banco' : '+ Banco'}
          </button>
        </div>
      </header>

      {/*
        Tres columnas solo a partir de 2xl (1536px): por debajo no hay ancho
        para los laterales sin estrangular el contenido, así que se ocultan y
        la columna central vuelve a centrarse con su ancho máximo de lectura.
      */}
      <div className="mx-auto w-full max-w-[1700px] px-4 sm:px-6 py-6 sm:py-8">
        {/* ── Consentimiento caducado ─────────────────────── */}
        {expiredSessions.length > 0 && (
          <div className="w-full max-w-[1150px] mx-auto 2xl:max-w-none mb-5 px-6 py-3 rounded-2xl border border-rust/40 bg-rust/[0.06] flex items-center justify-between gap-4">
            <span className="font-mono text-xs text-rust">
              {expiredSessions.length === 1
                ? `Consentimiento expirado — ${expiredSessions[0].aspspName}`
                : `${expiredSessions.length} consentimientos expirados`}
            </span>
            <button
              onClick={() => setShowConnect(true)}
              className="font-mono text-[11px] text-fog hover:text-stone underline underline-offset-2 transition-colors shrink-0"
            >
              Renovar
            </button>
          </div>
        )}

        {view === 'panel' ? (
          <div className="grid grid-cols-1 2xl:grid-cols-[190px_minmax(0,1fr)_268px] gap-5 items-start">
            {/* ── Índice de apartados ─────────────────────── */}
            <aside className="hidden 2xl:block sticky top-[76px] max-h-[calc(100vh-96px)] overflow-y-auto no-scrollbar">
              <SideNav items={NAV_ITEMS} containerId="dashboard-sections" />
            </aside>

            {/* ── Columna principal ───────────────────────── */}
            <main
              id="dashboard-sections"
              className="w-full max-w-[1150px] mx-auto 2xl:max-w-none space-y-5 min-w-0"
            >
              {/* ── Saldo ──────────────────────────────── */}
              <HeroBalance accounts={shown} month={month} accountId={accountFilter} />

              {/* ── Selector de mes ────────────────────── */}
              {accounts.length > 0 && (
                <MonthSelector month={month} onChange={setMonth} accountId={accountFilter} />
              )}

              {/* ── Entra, sale y queda ────────────────── */}
              <MonthFlow accounts={shown} month={month} accountId={accountFilter} />

              {/* ── Evolución diaria del gasto ─────────── */}
              <MonthlyTrend accounts={shown} month={month} accountId={accountFilter} />

              {/* ── Donut + categorías ─────────────────── */}
              <SpendingChart accounts={shown} month={month} accountId={accountFilter} />

              {/* ── Tickets de compra: desglose de la cesta ─ */}
              <Receipts month={month} accountId={accountFilter} />

              {/* ── Consejos generados por IA ──────────── */}
              <AdvicePanel accounts={shown} month={month} accountId={accountFilter} />

              {/* ── Movimientos ────────────────────────── */}
              <TransactionList accounts={shown} month={month} accountId={accountFilter} />
            </main>

            {/*
              ── Fichas laterales ──────────────────────────
              Por debajo de 2xl no se ocultan: caen debajo del panel en dos
              columnas. Ritmo es el único sitio donde se pone el presupuesto
              y Cuentas el único donde se renombran, así que esconderlas
              dejaba esas dos funciones fuera del alcance en un portátil.
            */}
            <aside className="grid gap-5 md:grid-cols-2 items-start 2xl:grid-cols-1 2xl:sticky 2xl:top-[76px] 2xl:max-h-[calc(100vh-96px)] 2xl:overflow-y-auto no-scrollbar">
              <SpendingPace accounts={shown} month={month} accountId={accountFilter} />
              <RecentTransactions accounts={shown} accountId={accountFilter} />
              <AccountBalances
                sessions={sessions}
                month={month}
                activeId={accountId}
                onSelect={setAccountId}
              />
            </aside>
          </div>
        ) : (
          /* Sin índice ni fichas: aquí no se consulta nada, se mantiene. */
          <main className="w-full max-w-[1150px] mx-auto">
            <Management accounts={shown} month={month} accountId={accountFilter} />
          </main>
        )}
      </div>

      {/*
        ── Chat ─────────────────────────────────────────
        Flotante y no un apartado más: preguntar por una gráfica sin dejar
        de verla es justo lo que lo hace útil.
      */}
      {accounts.length > 0 && !showChat && (
        <button
          onClick={() => setShowChat(true)}
          title="Preguntar sobre tus datos (Ctrl + K)"
          className="fixed bottom-5 left-5 z-30 flex items-center gap-2 bg-shell border border-wall hover:border-fog rounded-full px-4 py-2.5 font-mono text-[11px] tracking-[0.12em] uppercase text-fog hover:text-stone transition-colors shadow-lg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
          </svg>
          Preguntar
        </button>
      )}

      <ChatDrawer
        open={showChat}
        onClose={() => setShowChat(false)}
        month={month}
        accountId={accountFilter}
        accountLabel={activeAccount ? accountLabel(activeAccount) : undefined}
      />

      {/* ── Toast ───────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 max-w-[90vw] px-5 py-3 rounded-2xl bg-shell border font-mono text-xs tracking-wide shadow-lg ${
            toastError ? 'border-rust/50 text-rust' : 'border-wall text-moss'
          }`}
        >
          {toast}
        </div>
      )}

      {/* ── Connect modal ───────────────────────────────── */}
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  )
}
