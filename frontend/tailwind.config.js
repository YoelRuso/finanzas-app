/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Escala de superficies. Los tonos llevan una pizca de azul respecto
        // al negro puro para que las capas se distingan sin subir el brillo.
        void: '#08080C',
        slab: '#15161F',
        shell: '#191A24',
        pit:  '#20212C',
        wall: '#31333F',
        stone: '#F0EDE6',
        // Los dos grises de texto secundario van un 15-18% más luminosos que
        // el gris original: sobre el fondo casi negro, el tono anterior
        // (#5E5E6E) se quedaba en 2,7:1 de contraste y las etiquetas
        // pequeñas costaban de leer. Ahora rondan 7,6:1 y 3,6:1.
        fog:  '#AAAAB8',
        dust: '#6F6F82',
        brass: '#D4B87A',
        moss: '#5CB87A',
        rust: '#CC6565',
        // category chart palette
        cat: {
          coral: '#E8927C',
          sky: '#7EB8DA',
          lavender: '#B48EDB',
          mint: '#6CC9A1',
          amber: '#F0C86C',
          terra: '#D4856A',
          ice: '#85C7E8',
          lime: '#88D4A0',
          slate: '#8A8A9A',
        },
      },
      fontFamily: {
        // Inter para la interfaz, Space Grotesk reservada a títulos, y la
        // mono solo para cifras, etiquetas y timestamps.
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Menlo', 'monospace'],
        // Solo para prosa larga (los consejos). Es la hermana sans de la
        // mono que ya usa la app, así que comparten esqueleto: humanista,
        // de formas abiertas y con buen aguante en claro sobre oscuro,
        // donde Inter se cierra y cansa a partir de un par de frases.
        reading: ['"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
