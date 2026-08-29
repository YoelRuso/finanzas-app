# CLAUDE.md — Contexto del proyecto

## Qué es esto

App **personal** (un único usuario: el dueño del proyecto) de gestión financiera. Objetivo: visualizar en qué se gasta el dinero mediante gráficas, y recibir consejos generados por IA sobre qué se está haciendo bien y qué mejorar, según los datos reales de gasto.

No es un producto multiusuario ni comercial. No hace falta sistema de registro, roles, ni gestión de permisos complejos.

## Stack técnico

- **Gestor de paquetes: pnpm** (no usar npm ni yarn en ningún comando ni script).
- **Backend:** Node.js + TypeScript + Express
- **ORM / DB:** Prisma. Base de datos: PostgreSQL
- **Frontend:** React + TypeScript + Vite
- **Estilos:** Tailwind CSS
- **Gráficas:** Recharts
- **Data fetching:** TanStack Query (React Query)
- **Monorepo simple:** carpetas `backend/` y `frontend/` en la raíz, sin herramientas de monorepo adicionales (no Turborepo/Nx) salvo que se decida lo contrario.

## Estructura de carpetas objetivo

```
finanzas-app/
├── backend/
│   ├── src/
│   │   ├── routes/          (transactions, accounts, ai-advice)
│   │   ├── services/        (enableBanking.ts, claude.ts, categorizer.ts)
│   │   ├── db/               (schema Prisma, migraciones)
│   │   └── index.ts
│   ├── keys/                 (clave privada .pem — NUNCA se sube a git)
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       (Dashboard, Chart, AdvicePanel)
│   │   ├── pages/
│   │   └── api/               (cliente para el backend)
│   └── package.json
└── README.md
```

## Navegación

Dos vistas, sin router ni dependencias añadidas: `Dashboard.tsx` es el
armazón (cabecera, cuenta activa, mes) y cambia el cuerpo según la ruta,
con `pushState` + `popstate`, así que recargar y el botón de atrás funcionan.

- `/` — **el panel**, solo lectura: saldo, entra y sale (ingresos, gastos y lo
  que queda del mes), evolución diaria, gasto por categoría, tickets, consejos
  y movimientos. Nada que se edite vive aquí.
- `/gestion` — **mantenimiento** (`pages/Management.tsx`): clasificar lo que
  quedó en «otros», los gastos fijos que el histórico delata y la lista de
  gastos fijos. Ocupan mucho y se miran poco, así que fuera del panel. El
  enlace de la cabecera lleva un contador de movimientos sin clasificar.
  Las propuestas van justo encima de la lista a la que alimentan y solo se
  pintan cuando hay algo que proponer: es una tarea, no un panel fijo.

Ojo si se sirve en producción: `/gestion` necesita que el servidor devuelva
`index.html` (el dev server de Vite ya lo hace).

### En el móvil

La app se abre desde el móvil (los tickets se fotografían allí), así que el
ancho de referencia son 390 px. Tres sitios donde eso obliga a cambiar de
forma, no solo a encoger:

- **Cabecera:** en la fila solo caben tres cosas. Por debajo de `sm`, el
  selector de cuenta pasa de tira de píldoras a desplegable (enseña solo la
  activa) y «+ Banco» se queda en el signo — salvo sin ninguna cuenta, que es
  la acción principal y va con nombre. Con las píldoras, las cuentas quedaban
  detrás de un scroll horizontal sin barra: invisibles.
- **Cabecera de apartado (`Section`):** envuelve. El título no se encoge, así
  que sin envolver se salía por encima de sus propios controles.
- **Filas de importes:** lo que no cabe baja a su línea (el aviso de «supera
  los ingresos» del gasto por categoría). Encogerlo empujaba el importe fuera
  del panel, que además recorta.
- **Orden:** por debajo de `md`, «Ritmo» sube al cuerpo (justo tras «Entra y
  sale») y «Últimos» se oculta. En la columna lateral, Ritmo quedaba a 4.000
  px de scroll —detrás de los 33 movimientos— y Últimos repetía la lista que
  se acababa de leer. Ritmo se pinta en un sitio o en el otro, nunca en los
  dos: `md:hidden` arriba, `hidden md:block` en el lateral.
- **Concepto de un movimiento:** dos líneas (`line-clamp-2`), y sin el
  prefijo del banco (`src/description.ts`). «Pago en» encabeza 264 de cada
  500 movimientos y el signo del importe ya dice si se pagó o se cobró, así
  que se quita al pintarlo; «Bizum enviado a» y compañía se quedan en
  «Bizum ·». Es solo presentación: en la base de datos, en el buscador y en
  el `title` de la fila sigue el texto tal cual lo manda el banco, y basta
  borrar una línea de la tabla para que un prefijo vuelva. Lo usan las dos
  listas de movimientos, el clasificador y los tickets, para que un mismo
  cargo no se llame de dos maneras distintas según dónde se mire.
- **Tocar vale por pasar el ratón:** las gráficas responden al clic además de
  al hover, porque el gasto de un día concreto no está escrito en ningún otro
  sitio. Lo que sigue siendo solo de ratón son los `title=""`: nada que no se
  pueda deducir de lo que ya se ve.

Cuidado con Recharts 3: los manejadores de ratón del gráfico ya **no** reciben
`activePayload`, solo `activeTooltipIndex` —y como cadena—. Al actualizar, la
cabecera de «Evolución de gasto» y el centro del donut se quedaron mudos sin
error ninguno. El dato se busca por índice en los datos que se le pasaron
(`pointAt` / `categoryAt`). Los manejadores puestos en `<Pie>` directamente no
llegan a dispararse: van en `<PieChart>`.

## Integración bancaria: Enable Banking

Se usa **Enable Banking** (no GoCardless: dejaron de aceptar altas nuevas de Bank Account Data desde julio de 2025).

- **Application ID (client_id):** `5df22948-ec23-4d5f-b4f3-70d44ea2ed91`
  (este ID no es secreto en sí mismo, es un identificador público de la aplicación).
- **Clave privada (.pem):** generada al registrar la app, usada para firmar los JWT que autentican cada llamada a la API. **Nunca** debe subirse a git ni exponerse en el frontend. Vive en `backend/keys/`, referenciada desde `.env` con una ruta, y `backend/keys/` está en `.gitignore`.
- **Entorno actual:** Sandbox (para desarrollo/pruebas). Antes de conectar el banco real habrá que crear una aplicación de Producción por separado.
- **Redirect URL configurada:** `http://localhost:3000/callback` (ajustar si cambia el puerto del backend).
- Documentación oficial: https://enablebanking.com/docs/

## Módulo de IA (consejos financieros)

- Se usa la **API de Gemini (Google)**, paquete `@google/genai`. Toda la
  integración vive en `backend/src/services/gemini.ts`: cliente, traducción de
  errores y el helper `generateJson`, que es lo único que llama al modelo
  (lo usan tanto los consejos como el lector de tickets).
- Superficie del SDK: `ai.interactions.create({ model, system_instruction, input, response_format })`
  y se lee `interaction.output_text`. Salida estructurada con
  `response_format: { type: 'text', mime_type: 'application/json', schema }`.
- Los esquemas se escriben conservadores (solo `type`, `properties`, `required`,
  `items`, `enum`, `description`). Gemini rechaza construcciones que no soporta,
  así que los campos opcionales usan un valor centinela (cadena vacía, 0) en
  vez de `anyOf` con `null`.
- Modelo: `gemini-3.6-flash` en las constantes `ADVICE_MODEL` y `RECEIPT_MODEL`.
- Input: transacciones ya categorizadas del periodo (mes actual, comparativa con el mes anterior).
- Output esperado: resumen breve + puntos fuertes + áreas de mejora + 1-2 acciones concretas para el próximo mes.
- Tono preferido: directo, sin paternalismo, con números concretos (a definir/ajustar según gustos del usuario).

## Chat sobre los datos

Panel lateral (`frontend/src/components/ChatDrawer.tsx`) que se abre desde el
botón flotante o con `Ctrl/Cmd + K`. No es un apartado del dashboard a
propósito: así se puede preguntar por una gráfica sin dejar de verla.

- **Contexto:** hereda el mes y la cuenta que se están viendo. El resumen de
  ese mes (`buildMonthContext`) viaja en el `system_instruction` de cada
  pregunta, así que nunca se queda obsoleto dentro del hilo.
- **Herramientas:** para todo lo que no esté en ese resumen, el modelo pide
  datos con las funciones de `backend/src/services/chatTools.ts`
  (`buscar_movimientos`, `resumen_mes`, `buscar_productos`). El bucle que las
  ejecuta vive en `backend/src/services/chat.ts`, con un tope de 4 vueltas;
  en la última se le retiran las herramientas para obligarle a responder.
- **Firmas:** los pasos que devuelve el modelo se le reenvían **tal cual**.
  Gemini 3 firma su razonamiento y exige recibir la firma junto a la llamada:
  reconstruirla a mano hace que la API rechace la petición con un 400.
- **Historial:** un único hilo en la tabla `ChatMessage` (app de un usuario).
  Viajan los 10 últimos mensajes como contexto; el resto queda solo para leer.
- **Coste:** cada pregunta es una llamada, más una por vuelta de herramientas.
  El tier gratuito de Gemini permite 5 peticiones por minuto, así que dos o
  tres preguntas seguidas pueden dar un 429 (el panel lo enseña tal cual).

## Categorización de gastos

- **Categorías:** las 12 de `backend/src/services/categorizer.ts`, duplicadas
  en `frontend/src/categories.ts` (hay que mantenerlas en sincronía).
- **Orden de prioridad:** reglas propias del usuario (`CategoryRule`) →
  reglas por defecto por palabra clave ("MERCADONA" → alimentación) → `otros`.
- **Propuesta con IA:** lo que cae en `otros` se agrupa por comercio y
  `POST /category-rules/suggest` le pide a Gemini una categoría para cada uno
  (`services/categorySuggester.ts`, una sola llamada para toda la lista). La
  IA **no escribe nada**: propone, y confirmar en pantalla es lo que crea la
  `CategoryRule`. La guía del prompt repite el criterio de las reglas por
  defecto (restaurante → ocio, súper → alimentación); si se cambian unas hay
  que cambiar la otra o las sugerencias contradirán a lo ya clasificado.

## Gastos fijos detectados

La lista de gastos fijos se escribía a mano teniendo la respuesta en la base
de datos. `backend/src/services/recurringDetector.ts` la busca: agrupa los
gastos de los últimos 200 días por comercio (el mismo `merchantKey` del
clasificador) y propone los que llegan cada mes por un importe estable.

- **Sin IA ni coste.** Son reglas, como `localAdvisor`: 3 cargos mínimo,
  todos los huecos entre 24 y 38 días, importe dentro del ±25% de la mediana
  y último cargo hace menos de 50 días (si no, es una suscripción de baja).
- **Se exigen *todos* los huecos en rango, no la media.** Es lo que descarta
  solo a los supermercados, que tienen cargos cada pocos días. El precio es
  perder las series con un mes saltado: el fallo que interesa tener.
- **Propone, no escribe** — mismo trato que las reglas de categoría.
  `GET /fixed-expenses/suggestions` solo lee; el gasto lo crea el `POST` de
  siempre al confirmar en pantalla, con `sourceKey` = clave del comercio.
- **No repetir lo ya apuntado:** un gasto escrito a mano se llama "Gimnasio"
  y el banco cobra "Recibo SOLVENTIA 3 SL", que no se parecen en nada, así
  que la deduplicación mira **el importe** además del nombre. Ante la duda,
  callar: un duplicado aceptado suma el cargo dos veces al total de fijos y
  desajusta la barra de fijos contra variables.
- **Descartar se recuerda** (`RecurringDismissal`), o cada visita volvería a
  ofrecer lo mismo. Se puede deshacer desde el aviso.

## Tickets de compra (desglose de la cesta)

Fotografiar el ticket permite saber en qué se va exactamente el dinero de la compra, cosa que el concepto bancario ("MERCADONA 56,95 €") no dice.

- **Lectura:** una sola llamada a Gemini con visión (`backend/src/services/receiptScanner.ts`), sin OCR aparte: los tickets abrevian los nombres ("LCH DESN 1L") y el modelo los interpreta mejor. La imagen va como bloque `{ type: 'image', data, mime_type }` en el `input`.
- **Subcategorías:** 15 claves definidas en `backend/src/services/subcategories.ts`, duplicadas en `frontend/src/subcategories.ts` (hay que mantenerlas en sincronía, igual que `categories.ts`). Once son alimentación; droguería, higiene, hogar y otros no lo son, y se reparten a categorías del dashboard con `SUBCATEGORY_PARENT`.
- **Relación con el banco:** un ticket se vincula al movimiento que lo pagó (mismo importe ±0,02 €, ±4 días). Vinculado **no** suma gasto nuevo: solo desglosa lo que ya estaba contado. Sin vincular (efectivo) sí es gasto propio, y aparece aparte en el resumen.
- **Aprendizaje:** al corregir la subcategoría de un producto se guarda una `ProductRule` (nombre completo del producto → subcategoría) que gana sobre la IA en los tickets siguientes. Mismo patrón que `CategoryRule`.
- **Imágenes:** en `backend/uploads/receipts/`, fuera de la base de datos y en `.gitignore`. Se reducen en el navegador antes de subirlas (`frontend/src/image.ts`).
- **Móvil:** el frontend escucha en toda la red local y el cliente deduce la URL del backend del host actual, para poder abrir la app desde el móvil por wifi y usar la cámara.

## Fases de desarrollo

1. **MVP con CSV manual** — importar movimientos desde CSV exportado del banco, categorizar, mostrar 2-3 gráficas básicas.
2. **Conexión real con Enable Banking (sandbox)** — flujo de autenticación, listado de cuentas, sincronización de movimientos, usando el Mock ASPSP para probar sin arriesgar datos reales.
3. **Producción** — nueva aplicación en Enable Banking, conexión al banco real del usuario.
4. **Módulo de IA de consejos.**
5. **Tickets de compra por foto** — desglose de la cesta por subcategorías.
6. **Pulido:** alertas de gasto, objetivos de ahorro, aviso de renovación de consentimiento bancario.

## Convenciones de código

- TypeScript estricto (`strict: true`) en backend y frontend.
- Componentes React funcionales, con Hooks.
- Variables sensibles (claves, tokens) siempre en `.env`, nunca hardcodeadas.
- Commits descriptivos en español o inglés (a definir preferencia).

## Seguridad

- La clave privada de Enable Banking nunca se expone al frontend ni se loggea.
- No se guardan credenciales bancarias del usuario (el flujo de consentimiento PSD2 redirige siempre al propio banco).
- Datos sensibles en base de datos: valorar cifrado en reposo más adelante, aunque sea un proyecto de un único usuario.
