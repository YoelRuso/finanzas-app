/**
 * Cómo se llama una cuenta en pantalla: primero el alias que le haya puesto
 * el usuario, luego el nombre del banco, y si no hay nada, los últimos
 * dígitos del IBAN. ING, por ejemplo, no manda nombre.
 */
export function accountLabel(account: {
  alias?: string | null
  name?: string | null
  iban?: string | null
}): string {
  if (account.alias) return account.alias
  if (account.name) return account.name
  if (account.iban) return `•••• ${account.iban.slice(-4)}`
  return 'Cuenta'
}
