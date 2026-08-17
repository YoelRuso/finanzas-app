// Fuente única de categorías para toda la UI.
// Debe mantenerse en sincronía con CATEGORIES en backend/src/services/categorizer.ts

export const CATEGORIES = [
  'alimentacion',
  'transporte',
  'suscripciones',
  'salud',
  'ocio',
  'vivienda',
  'compras',
  'deporte',
  'educacion',
  'ingresos',
  'transferencias',
  'otros',
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<string, string> = {
  alimentacion: 'Alimentación',
  transporte: 'Transporte',
  suscripciones: 'Suscripciones',
  salud: 'Salud',
  ocio: 'Ocio',
  vivienda: 'Vivienda',
  compras: 'Compras',
  deporte: 'Deporte',
  educacion: 'Educación',
  ingresos: 'Ingresos',
  transferencias: 'Transferencias',
  otros: 'Otros',
}

export const CATEGORY_COLORS: Record<string, string> = {
  alimentacion: '#E8927C',
  transporte: '#7EB8DA',
  suscripciones: '#B48EDB',
  salud: '#6CC9A1',
  ocio: '#F0C86C',
  vivienda: '#D4856A',
  compras: '#85C7E8',
  deporte: '#88D4A0',
  educacion: '#C9A0DC',
  ingresos: '#5CB87A',
  transferencias: '#8FA8C8',
  otros: '#8A8A9A',
}

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return CATEGORY_LABELS.otros
  return CATEGORY_LABELS[category] ?? category
}

export function categoryColor(category: string | null | undefined): string {
  if (!category) return CATEGORY_COLORS.otros
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.otros
}
