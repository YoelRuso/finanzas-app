// Subcategorías del desglose de tickets.
// Debe mantenerse en sincronía con backend/src/services/subcategories.ts

export const SUBCATEGORIES = [
  'frutas_verduras',
  'carne',
  'pescado',
  'lacteos_huevos',
  'panaderia',
  'despensa',
  'congelados',
  'snacks_dulces',
  'bebidas',
  'alcohol',
  'preparados',
  'drogueria',
  'higiene',
  'hogar',
  'otros_ticket',
] as const

export type Subcategory = (typeof SUBCATEGORIES)[number]

/** Las que cuentan como comida de verdad. */
export const FOOD_SUBCATEGORIES: readonly string[] = [
  'frutas_verduras',
  'carne',
  'pescado',
  'lacteos_huevos',
  'panaderia',
  'despensa',
  'congelados',
  'snacks_dulces',
  'bebidas',
  'alcohol',
  'preparados',
]

export function isFood(subcategory: string): boolean {
  return FOOD_SUBCATEGORIES.includes(subcategory)
}

export const SUBCATEGORY_LABELS: Record<string, string> = {
  frutas_verduras: 'Frutas y verduras',
  carne: 'Carne',
  pescado: 'Pescado y marisco',
  lacteos_huevos: 'Lácteos y huevos',
  panaderia: 'Panadería',
  despensa: 'Despensa',
  congelados: 'Congelados',
  snacks_dulces: 'Snacks y dulces',
  bebidas: 'Bebidas',
  alcohol: 'Alcohol',
  preparados: 'Preparados',
  drogueria: 'Droguería',
  higiene: 'Higiene personal',
  hogar: 'Hogar y bazar',
  otros_ticket: 'Otros',
}

/**
 * Paleta de la cesta. Sigue el mismo criterio que la de categorías: tonos
 * apagados sobre fondo oscuro, agrupados por familia para que el desglose
 * se lea como un solo sistema — verdes y cálidos para el fresco, fríos para
 * lo que se conserva, grises azulados para lo que no es comida.
 */
export const SUBCATEGORY_COLORS: Record<string, string> = {
  frutas_verduras: '#6CC9A1',
  carne: '#E8927C',
  pescado: '#7EB8DA',
  lacteos_huevos: '#F0DDA8',
  panaderia: '#D9A566',
  despensa: '#C4A882',
  congelados: '#85C7E8',
  snacks_dulces: '#E5A3C4',
  bebidas: '#7ED4C8',
  alcohol: '#B48EDB',
  preparados: '#F0C86C',
  drogueria: '#8FA8C8',
  higiene: '#9BB8A8',
  hogar: '#A79A8E',
  otros_ticket: '#6E6E7E',
}

export function subcategoryLabel(subcategory: string | null | undefined): string {
  if (!subcategory) return SUBCATEGORY_LABELS.otros_ticket
  return SUBCATEGORY_LABELS[subcategory] ?? subcategory
}

export function subcategoryColor(subcategory: string | null | undefined): string {
  if (!subcategory) return SUBCATEGORY_COLORS.otros_ticket
  return SUBCATEGORY_COLORS[subcategory] ?? SUBCATEGORY_COLORS.otros_ticket
}
