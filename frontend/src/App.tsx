import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Dashboard from './components/Dashboard'
import PatternBackground from './components/PatternBackground'

export default function App() {
  const queryClient = useQueryClient()
  /** Cuentas que trajo la conexión recién hecha; null si no venimos de una. */
  const [justConnected, setJustConnected] = useState<number | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    if (connected !== null) {
      // El backend manda cuántas cuentas compartió el banco: pueden ser cero.
      const count = Number(connected)
      setJustConnected(Number.isFinite(count) ? count : 1)
      window.history.replaceState({}, '', '/')
      void queryClient.invalidateQueries()
    }
  }, [queryClient])

  return (
    <>
      {/* Rejilla de puntos de fondo, reactiva al cursor. Detrás de todo. */}
      <PatternBackground />
      <Dashboard
        justConnected={justConnected}
        onConnectedAck={() => setJustConnected(null)}
      />
    </>
  )
}
