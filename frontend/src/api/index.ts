/**
 * El backend siempre escucha en el :3000 de la misma máquina que sirve el
 * frontend. Derivarlo del host actual (en vez de fijar localhost) es lo que
 * permite abrir la app desde el móvil por wifi para fotografiar tickets.
 */
export const BASE = `${window.location.protocol}//${window.location.hostname}:3000`

/** El backend devuelve `{ error }` en los fallos; se usa como mensaje. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    // No era JSON — se cae al texto plano.
  }

  const text = (await res.text().catch(() => '')).trim()

  // Cuando el fallo no lo genera la app (un 404 de Express, un proxy caído)
  // el cuerpo es una página HTML entera: enseñarla en pantalla no dice nada.
  if (text === '' || text.startsWith('<')) {
    return `El servidor respondió ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
  }

  return text
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, options)
  if (!res.ok) {
    throw new Error(await errorMessage(res))
  }
  return res.json() as Promise<T>
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export interface Account {
  id: string
  uid: string
  iban: string | null
  name: string | null
  /** Nombre que le ha puesto el usuario; manda sobre `name`. */
  alias: string | null
  currency: string | null
  bankSessionId: string
}

/** Ingresos y gastos de una cuenta en el mes, con lo traspasado aparte. */
export interface AccountTotals {
  accountId: string
  uid: string
  alias: string | null
  name: string | null
  iban: string | null
  currency: string | null
  bank: string
  income: number
  spent: number
  net: number
  count: number
  transferredIn: number
  transferredOut: number
}

export interface BankSession {
  id: string
  sessionId: string
  aspspName: string
  aspspCountry: string
  validUntil: string
  accounts: Account[]
}

export interface Balance {
  balance_amount: { amount: string; currency: string }
  balance_type: string
  reference_date?: string
}

export interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  creditDebit: string
  currency: string
  category: string | null
  categoryManual: boolean
  /** Traspaso a otra cuenta propia: no cuenta como gasto ni como ingreso. */
  isTransfer: boolean
  transferPairId: number | null
  accountId: string
  account: { uid: string; iban: string | null; name: string | null; alias: string | null }
}

/** Movimientos agrupados por comercio, para reclasificar en bloque. */
export interface PendingGroup {
  key: string
  sample: string
  count: number
  total: number
  lastDate: string
  transactionIds: number[]
}

/** Un mes con movimientos. `month` es YYYY-MM. */
export interface MonthSummary {
  month: string
  spent: number
  income: number
  count: number
}

export interface AdvicePoint {
  titulo: string
  detalle: string
}

export interface Advice {
  resumen: string
  puntosFuertes: AdvicePoint[]
  areasDeMejora: AdvicePoint[]
  acciones: { accion: string; impacto: string }[]
}

/** 'local' analiza por reglas (gratis); 'gemini' llama a la API de Google. */
export type AdviceEngine = 'local' | 'gemini'

export interface AdviceResponse {
  month: string
  advice: Advice | null
  model?: string
  generatedAt?: string
  /** true si los movimientos cambiaron desde que se generó el consejo. */
  stale?: boolean
}

/** Un mensaje del chat. `model` solo viene en los del asistente. */
export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  month: string | null
  model: string | null
  createdAt: string
}

export interface ChatReply {
  /** La pregunta y la respuesta, ya guardadas. */
  messages: ChatMessage[]
  /** Herramientas que consultó el modelo para responder. */
  toolsUsed: string[]
}

export interface CategoryRule {
  id: number
  keyword: string
  category: string
  createdAt: string
  /** Movimientos que está clasificando ahora mismo. */
  matches?: number
}

/** Categoría que propone la IA para un comercio sin clasificar. */
export interface CategorySuggestion {
  /** Clave del comercio, la misma que trae `PendingGroup`. */
  key: string
  category: string
}

export interface CategorySummary {
  category: string
  total: number
}

export interface ASPSP {
  name: string
  country: string
  logo?: string
}

export interface FixedExpense {
  id: number
  name: string
  amount: number
  category: string | null
  icon: string | null
  /** Comercio del que salió, si se confirmó desde una propuesta. */
  sourceKey: string | null
}

/**
 * Gasto fijo que el detector ha encontrado en el histórico y todavía no está
 * en la lista. Es una propuesta: hasta que no se confirma no existe nada.
 */
export interface RecurringSuggestion {
  key: string
  name: string
  sample: string
  amount: number
  minAmount: number
  maxAmount: number
  category: string
  count: number
  everyDays: number
  firstDate: string
  lastDate: string
  confidence: 'alta' | 'media'
}

/** Una línea de un ticket: un producto con su subcategoría. */
export interface ReceiptItem {
  id: number
  name: string
  quantity: number
  unitPrice: number | null
  total: number
  subcategory: string
  manual: boolean
}

/** Movimiento bancario ya vinculado a un ticket. */
export interface LinkedTransaction {
  id: number
  date: string
  description: string
  amount: number
}

export interface Receipt {
  id: number
  merchant: string
  date: string
  total: number
  currency: string
  imagePath: string | null
  /** 'auto' | 'manual' | 'none' */
  matchStatus: string
  warning: string | null
  transactionId: number | null
  transaction: LinkedTransaction | null
  items: ReceiptItem[]
}

/** Movimiento que podría corresponder a un ticket sin vincular. */
export interface MatchCandidate {
  id: number
  date: string
  description: string
  amount: number
  category: string | null
  score: number
}

export interface ReceiptSummary {
  receiptCount: number
  itemCount: number
  total: number
  /** Ya contado en los movimientos del banco. */
  linkedTotal: number
  /** Tickets sin movimiento: gasto en efectivo, no está en el banco. */
  unlinkedTotal: number
  foodTotal: number
  nonFoodTotal: number
  bySubcategory: { subcategory: string; total: number }[]
  byCategory: { category: string; total: number }[]
}

export const api = {
  /** Ajustes de la app. `monthlyBudget` es null si no hay presupuesto. */
  getSettings: () => apiFetch<{ monthlyBudget: number | null }>('/settings'),

  setMonthlyBudget: (monthlyBudget: number | null) =>
    apiFetch<{ monthlyBudget: number | null }>('/settings', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ monthlyBudget }),
    }),

  getSessions: () =>
    apiFetch<{ sessions: BankSession[] }>('/banking/sessions'),

  getBalances: (uid: string) =>
    apiFetch<{ balances: Balance[] }>(`/banking/accounts/${uid}/balances`),

  /** `accountId` limita la consulta a una cuenta; sin él, son todas. */
  getSummary: (dateFrom?: string, dateTo?: string, accountId?: string) => {
    const q = new URLSearchParams()
    if (dateFrom) q.set('dateFrom', dateFrom)
    if (dateTo) q.set('dateTo', dateTo)
    if (accountId) q.set('accountId', accountId)
    const qs = q.toString() ? `?${q}` : ''
    return apiFetch<{ summary: CategorySummary[] }>(`/transactions/summary${qs}`)
  },

  getTransactions: (params?: {
    limit?: number
    dateFrom?: string
    dateTo?: string
    accountId?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.dateFrom) q.set('dateFrom', params.dateFrom)
    if (params?.dateTo) q.set('dateTo', params.dateTo)
    if (params?.accountId) q.set('accountId', params.accountId)
    const qs = q.toString() ? `?${q}` : ''
    return apiFetch<{ transactions: Transaction[] }>(`/transactions${qs}`)
  },

  /** Ingresos, gastos y neto de cada cuenta en el rango. */
  getByAccount: (dateFrom?: string, dateTo?: string) => {
    const q = new URLSearchParams()
    if (dateFrom) q.set('dateFrom', dateFrom)
    if (dateTo) q.set('dateTo', dateTo)
    const qs = q.toString() ? `?${q}` : ''
    return apiFetch<{ accounts: AccountTotals[] }>(`/transactions/by-account${qs}`)
  },

  getMonths: (accountId?: string) => {
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
    return apiFetch<{ months: MonthSummary[] }>(`/transactions/months${qs}`)
  },

  getPendingGroups: (category = 'otros', accountId?: string) => {
    const q = new URLSearchParams({ category })
    if (accountId) q.set('accountId', accountId)
    return apiFetch<{ groups: PendingGroup[]; totalTransactions: number }>(
      `/transactions/pending?${q}`
    )
  },

  /** Marca o desmarca un movimiento como traspaso entre cuentas propias. */
  setTransfer: (id: number, isTransfer: boolean) =>
    apiFetch<{ updated: number }>(`/transactions/${id}/transfer`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ isTransfer }),
    }),

  /** Nombre propio de una cuenta. Cadena vacía = volver al del banco. */
  setAccountAlias: (uid: string, alias: string) =>
    apiFetch<{ account: Account }>(`/banking/accounts/${uid}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ alias }),
    }),

  updateTransactionCategory: (
    id: number,
    data: { category: string; applyToSimilar?: boolean; keyword?: string }
  ) =>
    apiFetch<{ transaction: Transaction; applied: number; rule: CategoryRule | null }>(
      `/transactions/${id}/category`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    ),

  recategorizeAll: () =>
    apiFetch<{ reviewed: number; changed: number }>('/transactions/recategorize', {
      method: 'POST',
    }),

  getAdvice: (month: string, accountId?: string) => {
    const q = new URLSearchParams({ month })
    if (accountId) q.set('accountId', accountId)
    return apiFetch<AdviceResponse>(`/ai-advice?${q}`)
  },

  generateAdvice: (month: string, engine: AdviceEngine, accountId?: string) =>
    apiFetch<AdviceResponse>('/ai-advice/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, engine, accountId }),
    }),

  // ── Chat sobre los datos ───────────────────────────────────

  getChat: () => apiFetch<{ messages: ChatMessage[] }>('/chat'),

  /**
   * Manda una pregunta. `month` y `accountId` son lo que se está viendo:
   * el modelo los toma como "este mes" y "mi cuenta" cuando no se le dice
   * otra cosa.
   */
  sendChat: (mensaje: string, month: string, accountId?: string) =>
    apiFetch<ChatReply>('/chat', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ mensaje, month, accountId }),
    }),

  clearChat: () => apiFetch<{ deleted: number }>('/chat', { method: 'DELETE' }),

  getCategoryRules: () =>
    apiFetch<{ rules: CategoryRule[]; categories: string[] }>('/category-rules'),

  /**
   * Pide a la IA una categoría para cada comercio que sigue en «otros».
   * No guarda nada: propone, y se confirma desde la pantalla.
   */
  suggestCategories: (accountId?: string) =>
    apiFetch<{ suggestions: CategorySuggestion[]; model: string; remaining: number }>(
      '/category-rules/suggest',
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ accountId }),
      }
    ),

  createCategoryRule: (keyword: string, category: string) =>
    apiFetch<{ rule: CategoryRule; applied: number }>('/category-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, category }),
    }),

  deleteCategoryRule: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/category-rules/${id}`, { method: 'DELETE' }),

  getASPSPs: () =>
    apiFetch<{ aspsps: ASPSP[] }>('/banking/aspsps'),

  startAuth: (aspspName: string, aspspCountry: string) =>
    apiFetch<{ url: string }>('/banking/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aspspName, aspspCountry }),
    }),

  getFixedExpenses: () =>
    apiFetch<{ fixedExpenses: FixedExpense[]; total: number }>('/fixed-expenses'),

  createFixedExpense: (data: {
    name: string
    amount: number
    category?: string
    icon?: string
    /** Comercio del que viene, al confirmar una propuesta del detector. */
    sourceKey?: string
  }) =>
    apiFetch<{ expense: FixedExpense }>('/fixed-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Gastos fijos que el histórico delata y aún no están en la lista. */
  getRecurringSuggestions: (accountId?: string) =>
    apiFetch<{ suggestions: RecurringSuggestion[] }>(
      `/fixed-expenses/suggestions${accountId ? `?accountId=${accountId}` : ''}`
    ),

  /** "Esto no es un gasto fijo": no se vuelve a proponer. */
  dismissRecurring: (key: string) =>
    apiFetch<{ dismissed: string }>('/fixed-expenses/dismissals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }),

  /** Deshace el descarte. */
  restoreRecurring: (key: string) =>
    apiFetch<{ restored: boolean }>(
      `/fixed-expenses/dismissals/${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    ),

  updateFixedExpense: (id: number, data: { name?: string; amount?: number; category?: string; icon?: string }) =>
    apiFetch<{ expense: FixedExpense }>(`/fixed-expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteFixedExpense: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/fixed-expenses/${id}`, { method: 'DELETE' }),

  // ── Tickets de compra ──────────────────────────────────────

  /** Sube la foto de un ticket y devuelve el desglose ya guardado. */
  scanReceipt: (image: string) =>
    apiFetch<{ receipt: Receipt; candidates: MatchCandidate[] }>('/receipts/scan', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ image }),
    }),

  /**
   * Con `accountId` solo salen los tickets pagados con esa cuenta; los de
   * efectivo no tienen movimiento, así que quedan fuera del filtro.
   */
  getReceipts: (dateFrom?: string, dateTo?: string, accountId?: string) => {
    const q = new URLSearchParams()
    if (dateFrom) q.set('dateFrom', dateFrom)
    if (dateTo) q.set('dateTo', dateTo)
    if (accountId) q.set('accountId', accountId)
    const qs = q.toString() ? `?${q}` : ''
    return apiFetch<{ receipts: Receipt[] }>(`/receipts${qs}`)
  },

  getReceiptSummary: (dateFrom?: string, dateTo?: string, accountId?: string) => {
    const q = new URLSearchParams()
    if (dateFrom) q.set('dateFrom', dateFrom)
    if (dateTo) q.set('dateTo', dateTo)
    if (accountId) q.set('accountId', accountId)
    const qs = q.toString() ? `?${q}` : ''
    return apiFetch<ReceiptSummary>(`/receipts/summary${qs}`)
  },

  getReceiptCandidates: (id: number) =>
    apiFetch<{ candidates: MatchCandidate[] }>(`/receipts/${id}/candidates`),

  linkReceipt: (id: number, transactionId: number | null) =>
    apiFetch<{ receipt: Receipt }>(`/receipts/${id}/link`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ transactionId }),
    }),

  updateReceiptItem: (
    id: number,
    data: { subcategory: string; applyToSimilar?: boolean; keyword?: string }
  ) =>
    apiFetch<{ item: ReceiptItem; applied: number }>(`/receipts/items/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    }),

  deleteReceipt: (id: number) =>
    apiFetch<{ deleted: boolean }>(`/receipts/${id}`, { method: 'DELETE' }),

  /** URL directa de la foto guardada, para el <img>. */
  receiptImageUrl: (id: number) => `${BASE}/receipts/${id}/image`,

  /**
   * Importa movimientos. Sin fecha, el backend pide todo el histórico que el
   * banco quiera dar y cae a 90 días si lo rechaza por antiguo.
   */
  syncAccount: (accountUid: string) =>
    apiFetch<{
      synced: number
      total: number
      dateFrom: string
      limitedToRecent: boolean
    }>('/transactions/sync', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ accountUid }),
    }),
}
