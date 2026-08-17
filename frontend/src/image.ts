/**
 * Reducción de la foto del ticket antes de subirla.
 *
 * Una foto de móvil son 4-8 MB y unos 4000 px de lado; el modelo no
 * aprovecha más de ~2500 px, así que reducirla en el propio móvil ahorra
 * subida por wifi y tokens sin perder legibilidad del ticket.
 */

/** Lado largo máximo. Por encima de esto el modelo ya no gana detalle. */
const MAX_EDGE = 2000
const QUALITY = 0.9

/** Devuelve la foto como data URL JPEG, ya reducida y bien orientada. */
export async function prepareImage(file: File): Promise<string> {
  const source = await loadImage(file)
  const { width, height } = source

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen en este navegador')

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()

  return canvas.toDataURL('image/jpeg', QUALITY)
}

/**
 * createImageBitmap aplica la orientación EXIF, que importa mucho aquí: las
 * fotos de móvil suelen venir giradas y un ticket del revés se lee peor.
 * Si el navegador no lo soporta, se cae a <img>.
 */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Safari antiguo no acepta imageOrientation — sigue por el <img>.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('No se pudo leer la imagen'))
      img.src = url
    })
  } finally {
    // El bitmap ya está dibujado cuando se revoca; hacerlo aquí evita fugas.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
