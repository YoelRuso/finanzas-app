/**
 * El concepto que manda el banco empieza casi siempre por un prefijo que no
 * dice nada que no se sepa ya: «Pago en» son 264 de cada 500 movimientos, y
 * el signo del importe ya cuenta si el dinero salió o entró. En una fila de
 * móvil ese prefijo se come media línea de las dos que hay, y el nombre del
 * comercio —lo único que distingue una compra de otra— es lo que se corta.
 *
 * Solo cambia lo que se pinta. El texto original sigue en la base de datos,
 * es lo que busca el buscador y lo que se ve en el `title` de la fila, así
 * que nada de esto pierde información: si un prefijo resulta ser útil, se
 * borra su línea de la tabla y vuelve.
 */

/** Prefijo → lo que lo sustituye. Gana el primero que encaje. */
const PREFIXES: [string, string][] = [
  ['Pago en ', ''],
  ['Pago Bizum en ', 'Bizum · '],
  ['Bizum enviado a ', 'Bizum · '],
  ['Bizum recibido de ', 'Bizum · '],
  ['Transferencia recibida de ', 'Transferencia · '],
  ['Transferencia emitida a ', 'Transferencia · '],
  ['Nomina recibida ', 'Nómina · '],
  ['Devolución Tarjeta ', 'Devolución · '],
]

/** El concepto de un movimiento tal y como se enseña en pantalla. */
export function conceptLabel(description: string): string {
  const lower = description.toLowerCase()

  for (const [prefix, replacement] of PREFIXES) {
    if (!lower.startsWith(prefix.toLowerCase())) continue

    const rest = description.slice(prefix.length).trim()
    // Sin nada detrás, el prefijo era el concepto entero («Traspaso
    // interno emitido» y compañía): quitarlo dejaría la fila muda.
    return rest ? replacement + rest : description
  }

  return description
}
