// Subcategorías de un ticket de compra.
//
// El objetivo es responder «¿en qué se me va exactamente el dinero de la
// compra?», así que el desglose es fino dentro de alimentación y grueso
// fuera de ella: un ticket de supermercado trae también droguería, higiene
// y menaje, que no son comida y no deben contaminar el gasto en comida.
//
// Debe mantenerse en sincronía con frontend/src/subcategories.ts

export const SUBCATEGORIES = [
  // ── Alimentación ────────────────────────────────
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
  // ── No alimentación ─────────────────────────────
  'drogueria',
  'higiene',
  'hogar',
  'otros_ticket',
] as const

export type Subcategory = (typeof SUBCATEGORIES)[number]

export function isValidSubcategory(value: string): value is Subcategory {
  return (SUBCATEGORIES as readonly string[]).includes(value)
}

/** Subcategorías que cuentan como comida de verdad. */
export const FOOD_SUBCATEGORIES: readonly Subcategory[] = [
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
  return (FOOD_SUBCATEGORIES as readonly string[]).includes(subcategory)
}

/**
 * Categoría del dashboard a la que pertenece cada subcategoría.
 * Sirve para contar, por ejemplo, cuánto de un ticket de Mercadona no era
 * realmente alimentación. Si el reparto no convence, se cambia aquí.
 */
export const SUBCATEGORY_PARENT: Record<Subcategory, string> = {
  frutas_verduras: 'alimentacion',
  carne: 'alimentacion',
  pescado: 'alimentacion',
  lacteos_huevos: 'alimentacion',
  panaderia: 'alimentacion',
  despensa: 'alimentacion',
  congelados: 'alimentacion',
  snacks_dulces: 'alimentacion',
  bebidas: 'alimentacion',
  alcohol: 'alimentacion',
  preparados: 'alimentacion',
  drogueria: 'vivienda',
  higiene: 'compras',
  hogar: 'compras',
  otros_ticket: 'otros',
}

/** Descripción que se le pasa a la IA para que clasifique cada producto. */
export const SUBCATEGORY_GUIDE: Record<Subcategory, string> = {
  frutas_verduras: 'fruta, verdura y hortalizas frescas, ensaladas sin preparar',
  carne: 'carne fresca, aves, embutido, charcutería',
  pescado: 'pescado y marisco fresco o en conserva de pescadería',
  lacteos_huevos: 'leche, yogur, queso, mantequilla, nata, huevos',
  panaderia: 'pan, bollería, repostería, harinas de panadería',
  despensa: 'pasta, arroz, legumbres, conservas, aceite, salsas, especias, café, infusiones, azúcar, cereales',
  congelados: 'productos congelados de cualquier tipo',
  snacks_dulces: 'patatas fritas, frutos secos de aperitivo, chocolate, galletas, caramelos, helados',
  bebidas: 'agua, refrescos, zumos, bebidas isotónicas (sin alcohol)',
  alcohol: 'cerveza, vino, licores y cualquier bebida alcohólica',
  preparados: 'platos listos para comer, pizza refrigerada, comida preparada del súper',
  drogueria: 'limpieza del hogar, detergente, lavavajillas, lejía, bolsas de basura, papel higiénico, papel de cocina',
  higiene: 'higiene y cuidado personal: champú, gel, pasta de dientes, desodorante, cosmética, compresas, pañales',
  hogar: 'menaje, bazar, pilas, bombillas, textil, plantas, mascotas, papelería',
  otros_ticket: 'cualquier cosa que no encaje en las anteriores, o líneas que no sean productos',
}
