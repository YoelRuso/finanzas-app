// Guardado en disco de las fotos de los tickets.
//
// Las imágenes viven fuera de la base de datos, en backend/uploads/, que
// está en .gitignore: son fotos personales y no tienen por qué subirse.

import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'

// Con ts-node __dirname es backend/src/services y compilado backend/dist/services;
// en los dos casos dos niveles arriba es backend/.
export const RECEIPTS_DIR = path.resolve(__dirname, '../../uploads/receipts')

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export class ImageError extends Error {}

export interface ParsedImage {
  base64: string
  mediaType: string
  buffer: Buffer
}

/** Acepta un data URL ("data:image/jpeg;base64,…") o base64 pelado. */
export function parseDataUrl(input: string): ParsedImage {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(input.trim())
  const mediaType = (match ? match[1] : 'image/jpeg').toLowerCase()
  const base64 = match ? match[2] : input.trim()

  if (!EXTENSIONS[mediaType]) {
    throw new ImageError(
      `Formato de imagen no soportado: ${mediaType}. Usa JPEG, PNG o WebP.`
    )
  }

  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) {
    throw new ImageError('La imagen llegó vacía')
  }

  // Claude admite hasta 5 MB por imagen; el frontend ya la reduce antes de subirla.
  if (buffer.length > 5 * 1024 * 1024) {
    throw new ImageError('La foto pesa más de 5 MB — reduce la resolución antes de subirla')
  }

  return { base64, mediaType, buffer }
}

/** Guarda la foto y devuelve el nombre de fichero (no la ruta completa). */
export async function saveImage(image: ParsedImage): Promise<string> {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true })
  const filename = `${uuid()}.${EXTENSIONS[image.mediaType]}`
  await fs.writeFile(path.join(RECEIPTS_DIR, filename), image.buffer)
  return filename
}

/**
 * Ruta absoluta de una foto guardada.
 * Devuelve null si el nombre intenta salirse del directorio de tickets.
 */
export function resolveImage(filename: string): string | null {
  const full = path.resolve(RECEIPTS_DIR, filename)
  if (full !== path.join(RECEIPTS_DIR, path.basename(filename))) return null
  return full
}

export async function deleteImage(filename: string): Promise<void> {
  const full = resolveImage(filename)
  if (!full) return
  await fs.rm(full, { force: true })
}

export function mediaTypeOf(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}
