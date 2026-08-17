import fs from 'fs'
import path from 'path'
import jwt from 'jsonwebtoken'

const BASE_URL = 'https://api.enablebanking.com'

function makeJWT(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID
  const keyPath = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH
  if (!appId || !keyPath) throw new Error('ENABLE_BANKING_APP_ID o ENABLE_BANKING_PRIVATE_KEY_PATH no configurados en .env')
  const absolutePath = path.resolve(process.cwd(), keyPath)
  const privateKey = fs.readFileSync(absolutePath, 'utf8')
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 },
    privateKey,
    { algorithm: 'RS256', keyid: appId }
  )
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = makeJWT()
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Enable Banking API error ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ASPSP {
  name: string
  country: string
  logo?: string
  bic?: string
  psu_types: string[]
  maximum_consent_validity: number
  sandbox?: object[]
}

export interface AuthResponse {
  url: string
  authorization_id: string
}

export interface AccountResource {
  uid: string
  /** Donde viene el IBAN en la respuesta actual de la API. */
  account_id?: { iban?: string }
  /** Nombre antiguo del mismo campo; algunos ASPSP lo siguen mandando. */
  identification?: { iban?: string }
  name?: string
  currency?: string
  product?: string
}

/**
 * Campos que guardamos de una cuenta. Cada ASPSP rellena unos u otros
 * (ING, por ejemplo, no manda `name`), así que se toma el primero que haya.
 */
export function accountFields(acc: AccountResource): {
  iban: string | null
  name: string | null
  currency: string | null
} {
  return {
    iban: acc.account_id?.iban ?? acc.identification?.iban ?? null,
    name: acc.name ?? acc.product ?? null,
    currency: acc.currency ?? null,
  }
}

export interface SessionResponse {
  session_id: string
  accounts: AccountResource[]
  aspsp: { name: string; country: string }
  access: { valid_until: string }
}

export interface Balance {
  balance_amount: { amount: string; currency: string }
  balance_type: string
  last_change_date_time?: string
  reference_date?: string
}

export interface RawTransaction {
  entry_reference?: string
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator: 'CRDT' | 'DBIT'
  booking_date?: string
  value_date?: string
  remittance_information?: string[]
  creditor_name?: string
  debtor_name?: string
}

export interface TransactionsResponse {
  transactions: RawTransaction[]
  continuation_key: string | null
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function listASPSPs(country?: string): Promise<ASPSP[]> {
  const query = country ? `?country=${country}` : ''
  const data = await apiFetch<{ aspsps: ASPSP[] }>(`/aspsps${query}`)
  return data.aspsps
}

export async function startAuth(params: {
  aspspName: string
  aspspCountry: string
  state: string
  redirectUrl: string
  validUntil: string
  psuType?: string
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: params.validUntil },
      aspsp: { name: params.aspspName, country: params.aspspCountry },
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: params.psuType ?? 'personal',
    }),
  })
}

export async function exchangeCodeForSession(code: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>(`/sessions/${sessionId}`)
}

export async function getBalances(accountUid: string): Promise<Balance[]> {
  const data = await apiFetch<{ balances: Balance[] }>(`/accounts/${accountUid}/balances`)
  return data.balances
}

export async function getAllTransactions(
  accountUid: string,
  dateFrom: string,
  dateTo?: string
): Promise<RawTransaction[]> {
  const all: RawTransaction[] = []
  let continuationKey: string | undefined

  do {
    const params = new URLSearchParams({ date_from: dateFrom })
    if (dateTo) params.append('date_to', dateTo)
    if (continuationKey) params.append('continuation_key', continuationKey)

    const data = await apiFetch<TransactionsResponse>(
      `/accounts/${accountUid}/transactions?${params}`
    )
    all.push(...data.transactions)
    continuationKey = data.continuation_key ?? undefined
  } while (continuationKey)

  return all
}
