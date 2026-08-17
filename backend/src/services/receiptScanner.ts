// Lectura de tickets de compra con la API de Gemini (visión).
//
// Se le pasa la foto del ticket y devuelve JSON con una forma fija:
// comercio, fecha, total y una línea por producto ya clasificada en
// subcategorías. No usamos OCR aparte: los tickets de supermercado abrevian
// los nombres ("LCH DESN 1L", "TOMATE PERA KG") y el modelo los interpreta
// mucho mejor que un OCR seguido de reglas.

import { generateJson } from './gemini'
import { SUBCATEGORIES, SUBCATEGORY_GUIDE, isValidSubcategory } from './subcategories'

export const RECEIPT_MODEL = 'gemini-3.6-flash'

/** Lo que devuelve el modelo, antes de normalizar. */
interface RawItem {
  nombre: string
  cantidad: number
  /** 0 cuando el ticket no lo muestra — el esquema de Gemini no admite null. */
  precioUnitario: number
  total: number
  subcategoria: string
}

interface RawReceipt {
  comercio: string
  /** YYYY-MM-DD, o cadena vacía si el ticket no la trae. */
  fecha: string
  total: number
  moneda: string
  lineas: RawItem[]
  aviso: string
}

export interface ScannedItem {
  nombre: string
  cantidad: number
  precioUnitario: number | null
  total: number
  subcategoria: string
}

export interface ScannedReceipt {
  comercio: string
  fecha: string | null
  total: number
  moneda: string
  lineas: ScannedItem[]
  aviso: string
}

/**
 * Esquema deliberadamente conservador: solo type / properties / required /
 * items / enum / description. Gemini rechaza esquemas con construcciones
 * que no soporta, así que los campos opcionales se modelan con un valor
 * centinela (cadena vacía, 0) en vez de con `anyOf` + null.
 */
const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    comercio: { type: 'string', description: 'Nombre del establecimiento' },
    fecha: {
      type: 'string',
      description: 'Fecha del ticket en formato YYYY-MM-DD. Cadena vacía si no aparece.',
    },
    total: { type: 'number', description: 'Importe final pagado, tal cual aparece' },
    moneda: { type: 'string', description: 'Código ISO de la moneda, normalmente EUR' },
    lineas: {
      type: 'array',
      description: 'Una entrada por producto del ticket',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del producto, sin abreviar' },
          cantidad: {
            type: 'number',
            description: 'Unidades, o kilos si el producto va a peso',
          },
          precioUnitario: {
            type: 'number',
            description: 'Precio por unidad o por kilo. 0 si el ticket no lo muestra.',
          },
          total: { type: 'number', description: 'Importe cobrado por esta línea' },
          subcategoria: { type: 'string', enum: [...SUBCATEGORIES] },
        },
        required: ['nombre', 'cantidad', 'precioUnitario', 'total', 'subcategoria'],
      },
    },
    aviso: {
      type: 'string',
      description: 'Aviso si el ticket está borroso o incompleto. Cadena vacía si se lee bien.',
    },
  },
  required: ['comercio', 'fecha', 'total', 'moneda', 'lineas', 'aviso'],
} as const

const GUIDE_LINES = SUBCATEGORIES.map((key) => `- ${key}: ${SUBCATEGORY_GUIDE[key]}`).join('\n')

const SYSTEM_PROMPT = `Transcribes tickets de compra españoles y clasificas cada producto.

Devuelves una línea por producto del ticket, con su importe real ya cobrado.

Subcategorías disponibles (usa exactamente estas claves):
${GUIDE_LINES}

Reglas:
- Expande las abreviaturas del ticket a un nombre legible: "LCH DESN 1L" → "Leche desnatada 1L", "TOM PERA" → "Tomate pera". Conserva la marca si aparece.
- "total" de cada línea es lo que se cobró por esa línea, con el descuento ya aplicado si el ticket lo muestra en la misma línea.
- Si una línea es un descuento o promoción que se resta del total, inclúyela con importe negativo y la subcategoría del producto al que corresponde.
- No inventes productos ni importes. Si una línea está ilegible, ponle nombre "Ilegible", subcategoría "otros_ticket" y el importe que sí se lea.
- No incluyas líneas que no sean productos: subtotales, "TOTAL", forma de pago, IVA desglosado, puntos de fidelización.
- "cantidad" es 1 salvo que el ticket indique unidades o peso; para productos a peso pon los kilos (ej. 0.784) y en precioUnitario el precio por kilo.
- Clasifica por lo que es el producto, no por dónde se compra: el gel de ducha de un supermercado es "higiene", no alimentación.`

const USER_PROMPT = 'Esta es la foto de un ticket de compra. Transcríbelo y clasifica cada producto.'

export class ReceiptScanError extends Error {}

/**
 * Lee un ticket a partir de la imagen en base64.
 * `mediaType` es el MIME de la foto (image/jpeg, image/png…).
 */
export async function scanReceipt(
  base64: string,
  mediaType: string
): Promise<{ receipt: ScannedReceipt; model: string }> {
  const { data, model } = await generateJson<RawReceipt>({
    model: RECEIPT_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    input: [
      { type: 'image', data: base64, mime_type: mediaType },
      { type: 'text', text: USER_PROMPT },
    ],
    schema: RECEIPT_SCHEMA as unknown as Record<string, unknown>,
  })

  if (!Array.isArray(data.lineas)) {
    throw new ReceiptScanError('El modelo no devolvió ninguna línea — prueba con una foto más nítida')
  }

  // El esquema garantiza la forma, pero no que los valores sean sensatos.
  const receipt: ScannedReceipt = {
    comercio: data.comercio?.trim() || 'Comercio desconocido',
    fecha: data.fecha?.trim() ? data.fecha.trim() : null,
    total: data.total,
    moneda: data.moneda?.toUpperCase() || 'EUR',
    aviso: data.aviso ?? '',
    lineas: data.lineas.map((line) => ({
      nombre: line.nombre,
      cantidad: Number.isFinite(line.cantidad) && line.cantidad > 0 ? line.cantidad : 1,
      // 0 es el centinela de "el ticket no lo muestra".
      precioUnitario: line.precioUnitario > 0 ? line.precioUnitario : null,
      total: line.total,
      subcategoria: isValidSubcategory(line.subcategoria) ? line.subcategoria : 'otros_ticket',
    })),
  }

  return { receipt, model }
}
