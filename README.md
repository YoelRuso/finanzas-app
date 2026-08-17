# Finanzas App

App personal de gestión financiera con visualización de gastos y consejos de IA.

## Stack

- **Backend:** Node.js + TypeScript + Express + Prisma (SQLite en dev, PostgreSQL en prod)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Recharts + React Query

## Requisitos previos

- Node.js 18+
- pnpm (`npm install -g pnpm`)

## Instalación

### Backend

```bash
cd backend
pnpm install
cp .env.example .env
# Edita .env con tus valores reales
pnpm db:migrate   # Crea la base de datos y aplica migraciones
pnpm db:generate  # Genera el cliente Prisma
```

### Frontend

```bash
cd frontend
pnpm install
```

## Arrancar en local

### Backend (puerto 3000)

```bash
cd backend
pnpm dev
```

### Frontend (puerto 5173)

```bash
cd frontend
pnpm dev
```

Abre http://localhost:5173 en el navegador. Verás si el backend está conectado.

### Desde el móvil (para fotografiar tickets)

El frontend escucha en toda la red local y el cliente deduce la URL del backend
del host desde el que se abre, así que basta con:

1. Averigua la IP local del PC: `ipconfig` → «Dirección IPv4» (ej. `192.168.1.42`).
2. Con el móvil en la misma wifi, abre `http://192.168.1.42:5173`.
3. En el apartado **Tickets**, «Hacer foto» abre directamente la cámara.

Si no carga, casi siempre es el firewall de Windows: hay que permitir Node.js en
redes privadas, o abrir los puertos 5173 y 3000.

## Conectar un banco (túnel de Cloudflare)

Enable Banking exige que la URL de redirect sea **https pública**, y el backend
corre en `localhost`. Se expone con un túnel rápido de Cloudflare, que genera
un host **nuevo cada vez que se arranca**, así que hay que repetir los pasos 3
y 4 en cada conexión.

1. Backend en marcha: `cd backend; pnpm dev`.
2. En otra terminal: `cloudflared tunnel --url http://localhost:3000`.
   Devuelve una URL tipo `https://algo-aleatorio.trycloudflare.com`. Dejarla abierta.
3. Poner esa URL + `/callback` en `ENABLE_BANKING_REDIRECT_URL` (backend/.env).
4. Registrar la **misma URL exacta** en el panel de Enable Banking, en
   *Redirect URLs* de la aplicación. Si no coincide carácter a carácter, el
   banco rechaza la autorización.
5. Reiniciar el backend (el cambio de `.env` no lo recoge nodemon).
6. En el dashboard: **+ Banco** → elegir banco → consentir → vuelta automática.

Dos cosas que fallan a menudo:

- **Marcar la cuenta en la pantalla del banco.** La autorización puede salir
  válida y no traer ninguna cuenta si no se marca ninguna. Cuando pasa, el
  dashboard lo dice en rojo en vez de cantar victoria.
- **No reiniciar el backend entre "Conectar" y la vuelta del banco**: el token
  de estado vive en memoria y se perdería ("Unknown or expired state").

El consentimiento dura 90 días; al caducar, el dashboard avisa y hay que repetirlo.

## Varias cuentas

El panel principal siempre suma **todas** las cuentas. El apartado **Cuentas**
muestra el reparto del mes (ingresos, gastos, neto y saldo de cada una) y
permite abrir una sola: al hacerlo aparecen debajo su gasto por categoría, su
evolución, sus tickets, sus consejos y sus movimientos, solo de esa cuenta.

- **Alias**: pulsando sobre el nombre de una cuenta se le pone el propio
  ("Nómina", "Ahorro"). Los bancos suelen no mandar nombre.
- **Traspasos entre cuentas propias**: se detectan solos al sincronizar
  (importes opuestos, cuentas distintas, ±3 días, ±0,02 €) y quedan fuera de
  gastos e ingresos, porque el dinero no sale del patrimonio. En la lista de
  movimientos salen marcados «⇄ Traspaso» y se pueden corregir a mano; una vez
  corregidos, el detector automático ya no los toca.
- **Gastos fijos** no están repartidos por cuenta: son siempre globales, y por
  eso los consejos de una cuenta concreta no los tienen en cuenta.
- **Tickets en efectivo** no tienen movimiento y por tanto no tienen cuenta:
  solo aparecen en la vista global.

## Variables de entorno (backend/.env)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Ruta a la base de datos SQLite (ej. `file:./dev.db`) |
| `PORT` | Puerto del backend (por defecto 3000) |
| `GEMINI_API_KEY` | Clave de la API de Gemini ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) — consejos de IA y lectura de tickets |
| `ENABLE_BANKING_APP_ID` | ID de aplicación de Enable Banking |
| `ENABLE_BANKING_PRIVATE_KEY_PATH` | Ruta a la clave privada .pem de Enable Banking |
| `ENABLE_BANKING_REDIRECT_URL` | URL de vuelta del banco; el túnel de Cloudflare + `/callback` |
| `FRONTEND_URL` | A dónde redirige el backend tras conectar (por defecto `http://localhost:5173`) |

## Estructura del proyecto

```
finanzas-app/
├── backend/
│   ├── src/
│   │   ├── routes/       # Endpoints Express
│   │   ├── services/     # Lógica de negocio (Enable Banking, Claude, categorizador, tickets)
│   │   ├── db/           # Helpers de base de datos
│   │   └── index.ts      # Punto de entrada
│   ├── prisma/
│   │   └── schema.prisma
│   ├── keys/             # Clave privada .pem (nunca se sube a git)
│   ├── uploads/          # Fotos de tickets (nunca se suben a git)
│   └── .env.example
└── frontend/
    └── src/
        ├── components/
        ├── pages/
        └── api/          # Cliente para el backend
```

## Fases de desarrollo

1. **MVP con CSV manual** ← fase actual
2. Conexión con Enable Banking (sandbox)
3. Producción con banco real
4. Módulo de IA de consejos
5. Alertas, objetivos de ahorro, renovación de consentimiento
